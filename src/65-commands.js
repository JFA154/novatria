// ===== Module: Commands =====
/* SPEC.md section 12. Panel, save and debug commands are handled here in
   code; /look /zoom /skip /rest /wait /fact run a turn through the Pipeline
   (the narrator for the first five, the parser for /fact). /recap prints
   Pipeline.recap(), built from the game with no API call. */
const Commands = (() => {
  const LIST = [
    { name: '/look', args: '', desc: 'Describe the whole scene', turn: true },
    { name: '/zoom', args: '<action>', desc: 'A big moment, with more room', turn: true },
    { name: '/skip', args: '<where or when>', desc: 'Jump ahead to a place or time', turn: true },
    { name: '/pass', args: '', desc: 'Say nothing and see what they do', turn: true },
    { name: '/rest', args: '', desc: 'Sleep until morning and heal', turn: true },
    { name: '/wait', args: '<phase>', desc: 'Wait here until a phase', turn: true },
    { name: '/fact', args: '<statement>', desc: 'Spend a story point to make a statement true', turn: true },
    { name: '/sheet', args: '', desc: 'Open the Character panel' },
    { name: '/people', args: '', desc: 'Open the People panel' },
    { name: '/journal', args: '', desc: 'Open the Journal panel' },
    { name: '/recap', args: '', desc: 'Where you are, what is open, who matters' },
    { name: '/places', args: '', desc: 'Open the Places panel' },
    // Wave 16: several turns at once, /redo, and /rewind for turns /undo cannot reach.
    { name: '/undo', args: '[n or all]', desc: 'Take back the last turn (or n)' },
    { name: '/redo', args: '[n or all]', desc: 'Put back a turn you took back' },
    { name: '/rewind', args: '<n>', desc: 'Strike turns from the story (money stays)', help: 'Strike the last n turns from the story, for turns /undo cannot reach (money, health, things carried and feelings stay)' },
    { name: '/reroll', args: '', desc: 'Cheat: roll the last turn\'s dice again', turn: true },
    // Wave 6 (the round-5 visual QA): the / list's line fits at every width; /help keeps the long form (help).
    { name: '/cheat', args: '[outcome or time <phase> [day]]', desc: 'Cheat: redo the last roll, or set the clock', help: 'Cheat: redo the last roll (success, partial, fail, crit, fumble or 1-20), win your next hand at cards (cards), win it without playing it (win), set your cash (cash <amount>), or set the clock (forward only)', turn: true },
    { name: '/pronouns', args: '<who> <she|he|they>', desc: 'Set someone\'s pronouns' },
    { name: '/edit', args: '<who>', desc: 'Edit someone on the People tab' },
    { name: '/save', args: '[name]', desc: 'Save to a named slot (no name: open saved games)' },
    { name: '/load', args: '[name]', desc: 'Load a named save (no name: open saved games)' },
    { name: '/debug', args: '', desc: 'Toggle the debug view' },
    { name: '/help', args: '', desc: 'List the commands' }
  ];
  const PANEL_FOR = { '/sheet': 'character', '/people': 'people', '/journal': 'journal', '/places': 'places' };
  // Other words for a command (not listed: they would crowd the list typed after "/").
  const ALIASES = { '/commands': '/help' };
  /* The command list as text, one line each: "/skip <where or when>: Jump
     ahead to a place or time" (wave 3: /help and /commands print it). */
  function helpText() {
    // The first line is the heading the UI styles (wave 4, coordinator item 6), the second how to pick one.
    return ['Commands', 'Type / to pick one.'].concat(LIST.map(c => `${c.name}${c.args ? ' ' + c.args : ''}: ${c.help || c.desc}`)).join('\n');
  }
  function match(input) {
    const head = String(input || '').trim().split(/\s+/)[0].toLowerCase();
    return head.startsWith('/') ? LIST.filter(c => c.name.startsWith(head)) : [];
  }
  function usage(text) { UI.feed.notice(text); return { ok: false, reason: 'usage', restoreInput: true }; }
  function run(text) {
    const trimmed = String(text || '').trim();
    // '/Cheat: reroll' and '/reroll.' still land: case and a trailing colon or full stop do not matter.
    const rawHead = trimmed.split(/\s+/)[0];
    const said = rawHead.toLowerCase().replace(/[:.,!?]+$/, '');
    const head = ALIASES[said] || said;
    const arg = trimmed.slice(rawHead.length).trim();
    const cmd = LIST.find(c => c.name === head);
    if (!cmd) { UI.feed.notice(`There is no ${head} command. Type / to see the list.`); return { ok: false, reason: 'unknown', restoreInput: true }; }
    if (PANEL_FOR[cmd.name]) { UI.openPanel(PANEL_FOR[cmd.name]); return { ok: true }; }
    const dead = !!(State.current && State.current.player.dead);
    if (dead && (cmd.turn || ['/undo', '/redo', '/rewind'].includes(cmd.name))) { UI.feed.notice(Pipeline.NOTICES.dead); return { ok: false, reason: 'dead' }; }
    switch (cmd.name) {
      case '/help': {
        // A notice in the feed, one command a line (no turn, no API call; the composer's list after "/" is the same).
        UI.feed.notice(helpText(), 'help');
        return { ok: true };
      }
      case '/look': return Pipeline.look();
      case '/zoom': return arg ? Pipeline.zoom(arg) : usage('Zoom in on what? Try /zoom I kick the door in.');
      case '/skip': return arg ? Pipeline.skip(arg) : usage('Skip to where, or when? Try /skip to the docks at night.');
      case '/rest': return Pipeline.rest();
      case '/wait': return Pipeline.wait(arg);
      case '/fact': return arg ? Pipeline.fact(arg) : usage('State the fact you want to be true (not a question). Try /fact the ferryman owes me a favour.');
      case '/pass': return Pipeline.pass();
      case '/reroll': return Pipeline.reroll(arg);
      case '/recap': {
        // Built from the game itself: no turn, no API call.
        if (!State.current) return { ok: false, reason: 'no game' };
        Pipeline.printRecap();
        return { ok: true };
      }
      case '/pronouns': {
        const m = /^(.*?)\s*(?:\bis\b|\bgoes by\b|:)?\s*(she|her|he|him|they|them)(?:\/\w+)?[\s.!]*$/i.exec(arg || '');
        if (!m || !m[1].trim()) return usage("Whose pronouns, and which? Try /pronouns Mavis she (she, he or they).");
        const who = m[1].trim();
        const p = { her: 'she', him: 'he', them: 'they' }[m[2].toLowerCase()] || m[2].toLowerCase();
        const people = State.current.npcs.filter(n => n.alive !== false && (State.samePerson(n.name, who) || State.personKey(n.name).split(' ').includes(State.personKey(who))));
        const known = people.filter(n => n.knownToPlayer || n.created);
        const pick = known.length === 1 ? known[0] : people.length === 1 ? people[0] : null;
        if (!pick) return usage(people.length ? `Which ${who}? ${people.map(n => n.name).join(', ')}.` : `There is nobody called ${who} in the game.`);
        return App.setPronouns(pick.id, p);
      }
      case '/edit': {
        // Matched like /pronouns (full name, first name, or a word of it), the dead too, so they can be brought back.
        const who = String(arg || '').trim();
        if (!who) return usage('Edit whom? Try /edit Mavis.');
        const people = State.current.npcs.filter(n => State.samePerson(n.name, who) || State.personKey(n.name).split(' ').includes(State.personKey(who)));
        const known = people.filter(n => n.knownToPlayer || n.created);
        const pick = known.length === 1 ? known[0] : people.length === 1 ? people[0] : null;
        if (!pick) return usage(people.length ? `Which ${who}? ${people.map(n => n.name).join(', ')}.` : `There is nobody called ${who} in the game.`);
        if (UI.editPerson(pick.id)) return { ok: true, keepFocus: true };
        if (Pipeline.busy) return { ok: false, reason: 'busy' };
        UI.feed.notice(`${pick.name} is not on your People tab yet, so there is no card to edit.`);
        return { ok: false, reason: 'no-card' };
      }
      case '/cheat': {
        if (!arg) { UI.feed.notice('Cheats: /cheat success, /cheat partial, /cheat fail, /cheat crit, /cheat fumble or /cheat <1-20> redo the last roll with that outcome (or, with no roll to redo, make your next roll come out that way). /reroll rolls the last turn again at random. /cheat cards stacks the deck so you win your next hand at cards. /cheat win wins your next hand without playing it: the table is shown finished and the pot is yours (every open table also has a Win (cheat) button that does the same). /cheat cash <amount> sets your cash, as in /cheat cash 25. /cheat time <phase> [day] sets the clock, as in /cheat time night or /cheat morning 2.'); return { ok: true }; }
        if (/^reroll\b/i.test(arg)) return Pipeline.reroll(arg.replace(/^reroll\s*/i, ''));
        // Your cash set outright (wave 16: what /rewind leaves as it was).
        if (/^(?:cash|money|gold)\b/i.test(arg)) return cheatCash(arg.replace(/^(?:cash|money|gold)\b[\s:]*/i, ''));
        // The next hand at cards is the player's (wave 10): free, no roll, nothing on record.
        if (/^(?:the\s+)?(?:cards?|poker|hand|deck)\b/i.test(arg)) return Pipeline.cheatCards();
        // The next hand won without playing it (wave 13: the owner's "cheat win").
        if (/^(?:a\s+|the\s+)?(?:win|wins|won)\b/i.test(arg)) return Pipeline.cheatWin();
        // The clock: "/cheat time night", "/cheat time morning 2", "/cheat night", "/cheat morning day 2".
        const TIME_WORD = /^(?:time|clock)\b[\s:]*/i;
        const when = TIME_WORD.test(arg) ? arg.replace(TIME_WORD, '') : /^(morning|afternoon|evening|night)\b/i.test(arg) ? arg : null;
        if (when !== null) {
          const m = /^(morning|afternoon|evening|night)?(?:\s*,?\s*(?:on\s+)?(?:day\s*)?(\d+))?[\s.!]*$/i.exec(when);
          return Pipeline.setClock(m && m[1] ? m[1].toLowerCase() : null, m && m[2] !== undefined ? parseInt(m[2], 10) : null);
        }
        return Pipeline.reroll(arg);
      }
      case '/undo': return undo(arg);
      case '/redo': return redo(arg);
      case '/rewind': return rewind(arg);
      case '/save': {
        if (!arg) { UI.showScreen('saves'); return { ok: true }; }
        const r = Storage.saveNamed(arg);
        if (r.ok) UI.feed.notice(`Saved to slot ${r.slot} as "${r.name}".`);
        else if (r.full) { UI.feed.notice('All three slots are taken. Pick one to overwrite.'); UI.showScreen('saves'); }
        else UI.feed.notice('Saving failed.', 'error');
        return { ok: !!r.ok };
      }
      case '/load': {
        if (!arg) { UI.showScreen('saves'); return { ok: true }; }
        const n = Storage.findSlot(arg);
        if (!n || !App.loadSlot(n)) { UI.feed.notice(`There is no save called "${arg}".`); return { ok: false, reason: 'missing' }; }
        return { ok: true };
      }
      case '/debug': {
        const on = UI.toggleDebug();
        if (on) UI.openPanel('debug');
        UI.feed.notice(on ? 'Debug view on. Hidden state is in the Debug tab.' : 'Debug view off.');
        return { ok: true };
      }
      default:
        return { ok: false, reason: 'unknown' };
    }
  }
  // ----- /undo, /redo, /rewind and /cheat cash (wave 16) -----
  /* How many: none said is 1, "all" all there are, else a whole number from
     1 ("/undo 3", "/undo 3 turns"). null when it is none of these. */
  function countOf(arg) {
    const a = String(arg || '').trim().toLowerCase().replace(/[.!]+$/, '');
    if (!a) return 1;
    if (/^all(?:\s+(?:of\s+them|turns?))?$/.test(a)) return 'all';
    const m = /^(\d{1,4})(?:\s+turns?)?$/.exec(a);
    return m && parseInt(m[1], 10) >= 1 ? parseInt(m[1], 10) : null;
  }
  const turns = n => (n === 1 ? '1 turn' : `${n} turns`);
  /* The end of every /undo notice: how many more can be taken back. */
  function leftLine() {
    const d = State.undoDepth();
    return d ? `${d} more can be taken back.` : 'Nothing more can be taken back.';
  }
  // What /rewind can strike now: every log entry but the first.
  function rewindRoom() { const s = State.current; return s && Array.isArray(s.log) ? Math.max(0, s.log.length - 1) : 0; }
  /* The cheats through steps back (or forward): armed before a step, armed
     after it (wave 11, L2; wave 13), so several steps keep one armed in any
     game passed through (a step's JSON: watch); the notice says when one is
     armed that was not. */
  function cheatWatch() {
    const w = { armed: Pipeline.cheatArmed, win: Pipeline.winArmed, keep: false, keepWin: false };
    w.see = json => { if (json.includes('"cardsCheat":true')) w.keep = true; if (json.includes('"cardsWin":true')) w.keepWin = true; };
    w.now = () => { if (Pipeline.cheatArmed) w.keep = true; if (Pipeline.winArmed) w.keepWin = true; };
    return w;
  }
  function cheatsBack(w) {
    Pipeline.keepCheat(w.armed || w.keep);
    Pipeline.keepWin(w.win || w.keepWin);
    return `${!w.armed && Pipeline.cheatArmed ? ' The cards cheat is armed again: the next hand is yours.' : ''}${!w.win && Pipeline.winArmed ? ' The win cheat is armed again: the next hand is yours without playing.' : ''}`;
  }
  /* /undo, /undo N, /undo all: each step exactly as it was (State.undoSteps),
     its game put on the redo stack. With a hand open at cards (wave 16, the
     owner's "I can't undo to the start of the game") the turn that dealt it
     is the first step, taken back free (Pipeline.takeBackHand): the table
     goes, the line goes back in the box, nothing is paid or rolled. Fewer
     steps than asked: as many as there are, and the notice says /rewind
     can strike the rest from the story. */
  function undo(arg) {
    if (Storage.readOnly) { UI.toast(UI.READ_ONLY_NOTICE); return { ok: false, reason: 'read-only', restoreInput: true }; }
    const want = countOf(arg);
    if (want === null) return usage('Take back how many turns? Try /undo, /undo 3 or /undo all.');
    // An armed /cheat cards stays armed, and one the turn spent comes back with it (wave 11, L2).
    const w = cheatWatch();
    if (Pipeline.handOpen) {
      const done = Pipeline.takeBackHand();
      return Promise.resolve(done).then(() => { w.now(); return undoMore(want, w, true); });
    }
    return undoMore(want, w, false);
  }
  function undoMore(want, w, hand) {
    const n = want === 'all' ? State.undoDepth() + (hand ? 1 : 0) : want;
    const more = hand ? n - 1 : n;
    const k = (hand ? 1 : 0) + (more > 0 ? State.undoSteps(more, w.see) : 0);
    if (!k) {
      const m = Math.min(n, rewindRoom());
      UI.feed.notice(m ? `There is nothing to undo exactly. /rewind ${m} strikes the last ${m === 1 ? 'turn' : `${m} turns`} from the story (money and feelings stay).` : 'There is nothing to undo.');
      return { ok: false, reason: 'nothing' };
    }
    if (!hand || k > 1) {
      // Everything goes back, an ending noted for after the next turn too (wave 5, the fourth review's bug 4).
      Pipeline.forgetEnding();
      World.forget(State.current.meta.turn);
      UI.rebuildFeed();
    }
    Pipeline.hooks.diceSalt = (Pipeline.hooks.diceSalt || 0) + 1; // so a retried roll is not the same number
    const cheats = cheatsBack(w);
    const head = `You took back ${k === 1 ? 'the last turn' : turns(k)}${hand ? '; the hand is off the table' : ''}.${cheats}`;
    const short = want !== 'all' && k < n ? Math.min(n - k, rewindRoom()) : 0;
    const tail = short ? `Only ${turns(k)} could be taken back exactly; /rewind ${short} strikes earlier turns from the story (money and feelings stay).` : leftLine();
    UI.feed.notice(`${head} ${tail}`);
    return { ok: true, undone: k };
  }
  /* /redo, /redo N, /redo all (wave 16): the steps an undo took back, put
     back in order (State.redoSteps); a new turn or another game empties
     them, and they are this page's only (never kept with the undo stack). */
  function redo(arg) {
    if (Storage.readOnly) { UI.toast(UI.READ_ONLY_NOTICE); return { ok: false, reason: 'read-only', restoreInput: true }; }
    const want = countOf(arg);
    if (want === null) return usage('Put back how many turns? Try /redo, /redo 2 or /redo all.');
    const w = cheatWatch();
    const k = State.redoSteps(want === 'all' ? State.redoDepth() : want, w.see);
    if (!k) { UI.feed.notice('There is nothing to redo.'); return { ok: false, reason: 'nothing' }; }
    Pipeline.forgetEnding();
    UI.rebuildFeed();
    const cheats = cheatsBack(w);
    const d = State.redoDepth();
    UI.feed.notice(`You put back ${turns(k)}.${cheats} ${d ? `${d} more can be put back.` : 'Nothing more to put back.'}`);
    return { ok: true, redone: k };
  }
  /* /rewind N, /rewind to <turn>, /rewind day <d> (wave 16): the last turns
     struck from the story (State rewind), for turns no undo step reaches (a
     game played before the stack was kept, or older than it); what nothing
     records by turn stays, and the notice says what. One /undo step. With a
     hand open, its turn is taken back first, free, as /undo does. */
  function rewind(arg) {
    if (Storage.readOnly) { UI.toast(UI.READ_ONLY_NOTICE); return { ok: false, reason: 'read-only', restoreInput: true }; }
    const a = String(arg || '').trim().toLowerCase().replace(/[.!]+$/, '');
    const to = /^to\s+(?:turn\s+)?(\d{1,6})$/.exec(a);
    const day = /^(?:to\s+)?(?:the\s+end\s+of\s+)?day\s+(\d{1,4})$/.exec(a);
    const n = to || day ? null : a ? countOf(a) : null;
    if (!to && !day && (n === null || n === 'all')) return usage('Strike how many turns from the story? Try /rewind 3 (or /rewind to turn 12, /rewind day 2).');
    if (Pipeline.handOpen) return Promise.resolve(Pipeline.takeBackHand()).then(() => rewindTo(to, day, n, true));
    return rewindTo(to, day, n, false);
  }
  function rewindTo(to, day, n, hand) {
    const s = State.current;
    const log = s.log;
    let keep;
    if (to) keep = log.filter(e => e.turn <= parseInt(to[1], 10)).length;
    else if (day) keep = log.filter(e => e.day <= parseInt(day[1], 10)).length;
    else keep = log.length - n;
    keep = Math.max(1, keep);
    const handLine = hand ? ' The hand is off the table, free.' : '';
    if (keep >= log.length) {
      UI.feed.notice(`${log.length > 1 ? 'Nothing to rewind: that is where the story is.' : 'Nothing to rewind: the story has only begun.'}${handLine}`);
      return { ok: false, reason: 'nothing' };
    }
    const T = log[keep - 1].turn;
    const snap = State.snapshot();
    const r = State.apply({ rewind: { turn: T } });
    if (r.rejected.length || !r.rewound) {
      State.restore(snap);
      UI.feed.notice(`Nothing was rewound: ${r.rejected.length ? r.rejected[0].reason : 'nothing changed'}.${handLine}`);
      return { ok: false, reason: 'rejected' };
    }
    const w = r.rewound;
    Pipeline.forgetEnding();
    Pipeline.forgetLastTurn();
    World.forget(T);
    Pipeline.hooks.diceSalt = (Pipeline.hooks.diceSalt || 0) + 1;
    UI.rebuildFeed();
    const settled = w.settled ? ' A thread settled then stays settled, with what it gave you.' : '';
    UI.feed.notice(`Rewound to turn ${T} (Day ${w.day}, ${w.phase}): ${turns(w.struck)} struck from the story.${handLine} Not taken back: money, health, things carried and how people feel, nor where you are or what you heard.${settled} /cheat cash <amount> sets your cash.`);
    return { ok: true, struck: w.struck, turn: T };
  }
  /* /cheat cash <amount> (wave 16): the player's cash set outright, in whole
     dollars, 0 to $1,000,000, through the engine's goldDelta: no roll,
     nothing in the story; one /undo step. */
  function cheatCash(arg) {
    if (Storage.readOnly) { UI.toast(UI.READ_ONLY_NOTICE); return { ok: false, reason: 'read-only', restoreInput: true }; }
    const m = /^\$?\s*(\d[\d,]*)(?:\.0+)?\s*(?:dollars?|bucks)?[.!]*$/i.exec(String(arg || '').trim());
    const amount = m ? parseInt(m[1].replace(/,/g, ''), 10) : NaN;
    if (!Number.isInteger(amount) || amount > 1000000) return usage('Set your cash to what? Try /cheat cash 25 (whole dollars, 0 to 1,000,000).');
    const s = State.current;
    if (s.player.gold === amount) { UI.feed.notice(`Your cash is already ${money(amount)}.`); return { ok: true, same: true }; }
    const snap = State.snapshot();
    const r = State.apply({ goldDelta: amount - s.player.gold });
    if (r.rejected.length) { State.restore(snap); UI.feed.notice(`Your cash was not changed: ${r.rejected[0].reason}.`); return { ok: false, reason: 'rejected' }; }
    UI.feed.notice(`Cheat: your cash is ${money(State.current.player.gold)} now.`);
    return { ok: true };
  }
  return { LIST, ALIASES, match, run, helpText, countOf };
})();

