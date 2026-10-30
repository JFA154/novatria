// ===== Module: Commands =====
/* SPEC.md section 12. Panel, save and debug commands are handled here in
   code; /look /zoom /skip /rest /wait /fact run a turn through the Pipeline
   (the narrator for the first five, the parser for /fact). */
const Commands = (() => {
  const LIST = [
    { name: '/look', args: '', desc: 'Describe the whole scene', turn: true },
    { name: '/zoom', args: '<action>', desc: 'A big moment, with more room', turn: true },
    { name: '/skip', args: '<goal>', desc: 'Jump ahead to a place or time', turn: true },
    { name: '/pass', args: '', desc: 'Say nothing and see what they do', turn: true },
    { name: '/rest', args: '', desc: 'Sleep until morning and heal', turn: true },
    { name: '/wait', args: '<phase>', desc: 'Wait here until a phase', turn: true },
    { name: '/fact', args: '<statement>', desc: 'Spend a story point on a fact', turn: true },
    { name: '/sheet', args: '', desc: 'Open the Character panel' },
    { name: '/people', args: '', desc: 'Open the People panel' },
    { name: '/journal', args: '', desc: 'Open the Journal panel' },
    { name: '/places', args: '', desc: 'Open the Places panel' },
    { name: '/jobs', args: '', desc: 'List the paid work you know of' },
    { name: '/undo', args: '', desc: 'Take back the last turn' },
    { name: '/reroll', args: '', desc: 'Cheat: roll the last turn\'s dice again', turn: true },
    { name: '/cheat', args: '[outcome]', desc: 'Cheat: redo the last roll as success, partial, fail, crit, fumble or 1-20', turn: true },
    { name: '/pronouns', args: '<who> she', desc: 'Set someone\'s pronouns (she, he or they)' },
    { name: '/edit', args: '<who>', desc: 'Edit someone on the People tab' },
    { name: '/save', args: '<name>', desc: 'Save to a named slot' },
    { name: '/load', args: '', desc: 'Open saved games' },
    { name: '/debug', args: '', desc: 'Toggle the debug view' }
  ];
  const PANEL_FOR = { '/sheet': 'character', '/people': 'people', '/journal': 'journal', '/places': 'places' };
  function match(input) {
    const head = String(input || '').trim().split(/\s+/)[0].toLowerCase();
    return head.startsWith('/') ? LIST.filter(c => c.name.startsWith(head)) : [];
  }
  function usage(text) { UI.feed.notice(text); return { ok: false, reason: 'usage', restoreInput: true }; }
  function run(text) {
    const trimmed = String(text || '').trim();
    // '/Cheat: reroll' and '/reroll.' still land: case and a trailing colon or full stop do not matter.
    const rawHead = trimmed.split(/\s+/)[0];
    const head = rawHead.toLowerCase().replace(/[:.,!]+$/, '');
    const arg = trimmed.slice(rawHead.length).trim();
    const cmd = LIST.find(c => c.name === head);
    if (!cmd) { UI.feed.notice(`There is no ${head} command. Type / to see the list.`); return { ok: false, reason: 'unknown', restoreInput: true }; }
    if (PANEL_FOR[cmd.name]) { UI.openPanel(PANEL_FOR[cmd.name]); return { ok: true }; }
    const dead = !!(State.current && State.current.player.dead);
    if (dead && (cmd.turn || cmd.name === '/undo')) { UI.feed.notice(Pipeline.NOTICES.dead); return { ok: false, reason: 'dead' }; }
    switch (cmd.name) {
      case '/look': return Pipeline.look();
      case '/zoom': return arg ? Pipeline.zoom(arg) : usage('Zoom in on what? Try /zoom I kick the door in.');
      case '/skip': return arg ? Pipeline.skip(arg) : usage('Skip to where, or when? Try /skip to the docks at night.');
      case '/rest': return Pipeline.rest();
      case '/wait': return Pipeline.wait(arg);
      case '/fact': return arg ? Pipeline.fact(arg) : usage('State the fact you want to be true. Try /fact the ferryman owes me a favour.');
      case '/pass': return Pipeline.pass();
      case '/jobs': {
        // Paid work at the places the player knows (direction change 16): no turn, nothing spent.
        const places = State.current.locations.filter(l => l.discovered && l.away !== true && Town.jobsAt(l.id).length);
        if (!places.length) { UI.feed.notice('You do not know of any paid work in town yet.'); return { ok: true }; }
        const at = l => `${l.name}${l.closed ? ' (closed)' : ''}: ${Town.jobsAt(l.id).map(j => lowerFirst(UI.workText(j))).join('; ')}.`;
        UI.feed.notice(`Work you know of (ask for it there; it is ${State.current.time.phase} now). ${places.map(at).join(' ')}`);
        return { ok: true };
      }
      case '/reroll': return Pipeline.reroll(arg);
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
        if (!arg) { UI.feed.notice('Cheats: /cheat success, /cheat partial, /cheat fail, /cheat crit, /cheat fumble or /cheat <1-20> redo the last roll with that outcome (or, with no roll to redo, make your next roll come out that way). /reroll rolls the last turn again at random. /cheat time <phase> [day] sets the clock, as in /cheat time night or /cheat morning 2.'); return { ok: true }; }
        if (/^reroll\b/i.test(arg)) return Pipeline.reroll(arg.replace(/^reroll\s*/i, ''));
        // The clock: "/cheat time night", "/cheat time morning 2", "/cheat night", "/cheat morning day 2".
        const TIME_WORD = /^(?:time|clock)\b[\s:]*/i;
        const when = TIME_WORD.test(arg) ? arg.replace(TIME_WORD, '') : /^(morning|afternoon|evening|night)\b/i.test(arg) ? arg : null;
        if (when !== null) {
          const m = /^(morning|afternoon|evening|night)?(?:\s*,?\s*(?:on\s+)?(?:day\s*)?(\d+))?[\s.!]*$/i.exec(when);
          return Pipeline.setClock(m && m[1] ? m[1].toLowerCase() : null, m && m[2] !== undefined ? parseInt(m[2], 10) : null);
        }
        return Pipeline.reroll(arg);
      }
      case '/undo': {
        if (!State.restore()) { UI.feed.notice('There is nothing to undo.'); return { ok: false, reason: 'nothing' }; }
        World.forget(State.current.meta.turn);
        Pipeline.hooks.diceSalt = (Pipeline.hooks.diceSalt || 0) + 1; // so a retried roll is not the same number
        UI.rebuildFeed();
        UI.feed.notice('You took back the last turn.');
        return { ok: true };
      }
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
  return { LIST, match, run };
})();

