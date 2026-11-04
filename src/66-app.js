// ===== Module: App =====
/* Boot and screen routing. A new game is prepared silently at "Review"
   (so the summary card can name the loose-end NPCs) and committed on Begin.
   A game that is loaded (Continue, a slot, an import, the previous
   autosave) is drawn before anything is saved: the autosave is written only
   once the game is on screen, and a game that fails to draw leaves the
   autosave and the game that was open as they were. Replacing an autosave
   that is in no save slot asks first (a copy is kept either way). */
const App = (() => {
  let inGame = false;
  /* Loading or starting a game while a turn waits on the API would let that
     turn finish (or roll back) on the wrong game and its autosave overwrite
     the one just loaded, so these entry points refuse until it is over (the
     UI disables their controls meanwhile). */
  const BUSY_NOTICE = 'Wait for the current turn to finish.';
  const NEWER_NOTICE = 'Saved by a newer version; it may not play right here.';
  function turnRunning() {
    if (!Pipeline.busy) return false;
    UI.toast(BUSY_NOTICE);
    return true;
  }
  function urlSeed() {
    try { return toInt(new URLSearchParams(window.location.search).get('seed')); } catch (e) { return null; }
  }
  /* Quiet lines (UI.pendingNotes) go on the newest log entry as notes, so
     the feed shows them again after a reload or an undo, where they were
     (wave 6, the round-5 playtest's R7): a line printed after the
     narration at the entry's own time is plain text, as before; one
     printed under a later divider keeps its day and phase, one printed
     before the narration its at ('start' before the roll, when the entry
     has one; else 'before'). */
  function noteFor(e, n) {
    if (!isObj(n)) return String(n);
    const same = !Number.isInteger(n.day) || (n.day === e.day && n.phase === e.phase);
    const at = n.at === 'start' ? (e.roll ? 'start' : 'before') : n.at === 'before' ? 'before' : 'after';
    if (same && at === 'after') return n.text;
    return Object.assign({ text: n.text }, same ? {} : { day: n.day, phase: n.phase }, at === 'after' ? {} : { at });
  }
  function attachNotes(s) {
    const notes = UI.takeNotes();
    if (!notes.length || !s || State.muted || !s.log.length) return false;
    const e = s.log[s.log.length - 1];
    // Through the engine (State logUpdate), like every other write; nothing to redraw (quiet: the feed already shows them).
    return !State.apply({ logUpdate: { notes: notes.map(n => noteFor(e, n)) } }, { quiet: true }).rejected.length;
  }
  /* Quiet lines written outside a turn (an edit, a pronoun): stored at once. */
  function flushNotes() {
    const s = State.current;
    if (attachNotes(s)) { Storage.autosave(); return true; }
    return false;
  }
  /* Wave 30 (the integration plan's 14.3, design section 7.2): the quiet
     lines for how people stand, at most two a change, one a person (the
     most important), the most important first. The engine's lines
     (State.takeFeed: leverage, silence, a spark status, the fear of what
     the player knows, favours owed) print with any change; after a turn,
     for each person the turn touched (State.relTouched: known and alive),
     the bands as the turn found them against now: a first-hand weight-3
     harm ("won't forget that"), fear ("is afraid of you", "gives you
     room"), trust both ways ("stops taking your word", "isn't sure of you
     any more", "is willing to hear you out again", "takes you at your word
     now"), liking over its seven bands ("warms to you", "cools toward
     you"), and a settlement that landed ("lets some of it go"). Fading
     (the morning is quiet), loads, undos and edits print nothing; the
     bands' hysteresis stops flicker; no spark line names anyone under 18
     (their spark never moves). */
  const LIKING = Rel.BANDS.w.map(b => b[0]);
  const TRUST_LINE = { 'unsure>distrusts': 'stops taking your word.', 'trusts>distrusts': 'stops taking your word.', 'trusts>unsure': "isn't sure of you any more.", 'distrusts>unsure': 'is willing to hear you out again.', 'unsure>trusts': 'takes you at your word now.', 'distrusts>trusts': 'takes you at your word now.' };
  let relSeen = { id: null, turn: -1 };
  function noteRel(s) {
    if (!s || State.muted || !Array.isArray(s.npcs)) return;
    const R = State.FEED_RANK;
    const items = State.takeFeed().filter(x => isObj(x) && x.text);
    const id = Storage.gameId(s);
    if (relSeen.id === id && s.meta.turn > relSeen.turn) {
      const t = State.relTouched();
      if (t.turn === s.meta.turn) {
        for (const npcId of Object.keys(t.touched)) {
          const n = State.npc(npcId);
          if (!n || !n.knownToPlayer || n.alive === false || !isObj(n.rel) || !isObj(n.rel.bands)) continue;
          const was = t.touched[npcId];
          const now = n.rel.bands;
          const line = (text, rank) => items.push({ text: `${n.name} ${text}`, npcId, rank });
          if (t.harm3.includes(npcId)) line("won't forget that.", R.harm);
          if (!isObj(was)) continue;
          if (now.f !== was.f && now.f === 'afraid' && now.ov !== 'know') line('is afraid of you.', R.fear);
          else if (now.f === 'uneasy' && was.f === 'calm') line('gives you room.', R.fear);
          if (now.t !== was.t && TRUST_LINE[`${was.t}>${now.t}`]) line(TRUST_LINE[`${was.t}>${now.t}`], R.trust);
          const a = LIKING.indexOf(was.w);
          const b = LIKING.indexOf(now.w);
          if (a >= 0 && b >= 0 && a !== b) line(b > a ? 'warms to you.' : 'cools toward you.', R.liking);
          if (t.settled.includes(npcId)) line('lets some of it go.', R.settled);
        }
      }
    }
    relSeen = { id, turn: s.meta.turn };
    // One line a person (the most important), then the two most important of those; a line about nobody in particular always prints.
    const best = new Map();
    const loose = [];
    for (const x of items) {
      if (!x.npcId) { loose.push(x); continue; }
      const b = best.get(x.npcId);
      if (!b || x.rank < b.rank) best.set(x.npcId, x);
    }
    const out = loose.concat(Array.from(best.values()).map((x, i) => ({ x, i })).sort((p, q) => (p.x.rank - q.x.rank) || (p.i - q.i)).slice(0, 2).map(y => y.x));
    for (const x of out) UI.feed.quiet(x.text);
  }
  function boot() {
    Storage.init();
    UI.init();
    State.onChange(s => {
      // Wave 30: the quiet lines for how people stand, ranked (noteRel: the engine's, then the turn's band lines).
      noteRel(s);
      attachNotes(s);
      Storage.autosave();
      UI.renderGame();
    });
    UI.showScreen('title');
  }
  /* The autosave, when replacing it with another game needs asking first:
     it is valid, a different game, and in no save slot. */
  function unsaved(nextState) {
    const auto = Storage.loadAutosave();
    if (!auto) return null;
    if (nextState && Storage.gameId(nextState) === Storage.gameId(auto.state)) return null;
    if (Storage.inSlot(auto.state)) return null;
    return auto;
  }
  function askReplace(auto, what) {
    return UI.ask({
      title: 'Replace the autosave?',
      text: `${UI.continueLine(auto)} is only in the autosave, not in a save slot. ${what} takes its place. A copy is kept as the previous autosave, and Save / Load can bring it back.`,
      yes: 'Go ahead',
      no: 'Keep it'
    });
  }
  function newGame() {
    if (turnRunning()) return false;
    const go = () => {
      if (UI.Create.needsChoice()) UI.Create.showChoice(); else UI.Create.start();
      UI.showScreen('create');
      return true;
    };
    const auto = unsaved(null);
    if (auto) return askReplace(auto, 'A new game').then(yes => (yes ? go() : false));
    return go();
  }
  function prepare(character, opts) {
    if (turnRunning()) return null;
    inGame = false;
    const s = opts && Number.isInteger(opts.seed) ? opts.seed : urlSeed();
    return State.newGame(TOWN_DATA, character, { seed: Number.isInteger(s) ? s : undefined, pending: true });
  }
  function cancelPrepare() { if (State.muted) State.clear(); }
  /* With mock mode off and a key set, the arrival is narrated (MODE
     arrival) and streams in after the game screen shows; otherwise, or if
     that fails, the local opening text is used. Either way a short tip on
     how to play follows the first narration (once per browser). */
  function begin() {
    const s = State.current;
    if (!s || !State.muted) throw new Error('no character prepared');
    // Begun in a tab that was read only: this tab plays now (its autosave makes the other tab read only).
    if (Storage.readOnly) Storage.setReadOnly(false);
    State.commit();
    inGame = true;
    // A hand left on a table is never this new game's (wave 12, M2): it is dropped, as a load that does not match drops it.
    Storage.dropHand();
    // A new game starts with nothing to undo, and the stack kept for the last one goes (wave 16).
    Storage.undoReset();
    Storage.requestPersist();
    const live = !Storage.settings().mockMode && !!Storage.getApiKey();
    if (live) {
      State.apply({ journalEntry: `Arrived in ${s.meta.townName}.` });
      UI.rebuildFeed();
      UI.showScreen('game');
      Promise.resolve(Pipeline.arrival()).then(() => UI.showTip(), () => {});
      return State.current;
    }
    State.apply({
      logEntry: { input: '', roll: null, narration: Town.openingScene(s), day: s.time.day, phase: s.time.phase },
      journalEntry: `Arrived in ${s.meta.townName}.`
    });
    UI.rebuildFeed();
    UI.showScreen('game');
    UI.showTip();
    return State.current;
  }
  function newerRules(st) {
    return State.rulesVersion(st) > State.RULES_VERSION;
  }
  /* Load a game and draw it before anything is saved: State's listeners
     (the autosave) hear about it only once it is on screen. If it cannot be
     drawn, the game that was open comes back and the error goes to the
     caller. Wave 16: opts.resume (Continue, Play here instead: the
     autosave) reads back the undo stack kept for that game; any other load
     starts with nothing to undo and clears the one kept. */
  function load(env, opts) {
    const before = State.current;
    const beforeJson = before && !State.muted ? JSON.stringify(before) : null;
    const beforeTown = State.town;
    const wasIn = inGame;
    const from = UI.screen;
    let r = null;
    // A loaded game is not a turn: no "warms to you" lines for what happened before it was loaded here.
    relSeen = { id: null, turn: -1 };
    State.beginBatch();
    try {
      r = State.load(env.state, env.town);
      inGame = true;
      UI.rebuildFeed();
      UI.showScreen('game');
    } catch (e) {
      try {
        if (beforeJson && State.current !== before) { State.load(JSON.parse(beforeJson), beforeTown); Storage.undoResume(); }
        else if (!beforeJson && State.current) State.clear();
      } catch (x) { console.error(x); }
      inGame = wasIn && !!beforeJson;
      try { if (inGame) { UI.rebuildFeed(); UI.showScreen('game'); } else if (from !== 'game') UI.showScreen(from); else UI.showScreen('title'); } catch (x) { console.error(x); }
      throw e;
    } finally {
      State.endBatch();
    }
    if ((isObj(r) && r.newer === true) || newerRules(env.state)) UI.warn(NEWER_NOTICE);
    // Loaded in a tab that was read only: this tab plays it now.
    if (Storage.readOnly) Storage.claim();
    if (opts && opts.resume) Storage.undoResume(); else Storage.undoReset();
    Storage.requestPersist();
    // A hand this game's page was closed on (wave 11, M1): folded or kept as played, after anything the load prints (Continue's recap).
    Promise.resolve().then(() => { try { const t = Pipeline.resumeHand(); if (t && typeof t.catch === 'function') t.catch(e => console.error(e)); } catch (e) { console.error(e); } });
    return true;
  }
  /* "Play here instead" (the bar in a read-only tab): this tab first loads
     the game as the other tab saved it (drawn before anything is written,
     like any load), then plays it, and its autosave makes the other tab
     read only. An autosave that cannot be read is kept as the previous
     autosave (Saves, Restore previous) before this tab's game is saved,
     and the banner says so: nothing is overwritten silently. */
  function playHere() {
    if (!Storage.readOnly) return true;
    if (Pipeline.busy) { UI.toast(BUSY_NOTICE); return false; }
    const raw = Storage.rawAutosave();
    let env = null;
    let why = '';
    if (raw) { try { env = Storage.parseEnvelope(raw, 'The saved game'); } catch (e) { why = e.message; } }
    if (env) {
      try { load(env, { resume: true }); } catch (e) { env = null; why = e.message || String(e); }
    }
    if (!env && raw) Storage.keepAside(raw);
    if (Storage.readOnly) Storage.claim();
    if (env) UI.toast('Playing here: the game as the other tab left it.');
    else if (raw) UI.warn(`The other tab's autosave could not be read (${lowerFirst(String(why || 'it is damaged').replace(/\.$/, ''))}). It is kept as the previous autosave (Saves, Restore previous), and this tab's game is saved.`);
    else UI.toast('Playing in this tab.');
    return !!env || !raw;
  }
  /* opts.confirmed: replacing the autosave was already agreed (or loses nothing). */
  function enter(env, opts) {
    if (turnRunning()) return false;
    const auto = opts && opts.confirmed ? null : unsaved(env && env.state);
    if (auto) return askReplace(auto, `Loading ${UI.continueLine(env) || 'that game'}`).then(yes => (yes ? load(env) : false));
    return load(env);
  }
  function continueGame() {
    if (turnRunning()) return false;
    const env = Storage.loadAutosave();
    if (!env) { UI.toast('There is no autosave yet.'); return false; }
    try { load(env, { resume: true }); } catch (e) { UI.warn('The autosave could not be loaded: ' + e.message); return false; }
    // Where things stand, when the Pipeline can say (a recap built in code, no API call).
    UI.showRecap();
    return true;
  }
  /* A promise from enter() (it asked first) or a boolean. */
  function settle(r, onOk, onErr) {
    if (r && typeof r.then === 'function') return r.then(ok => (ok ? onOk() : false), e => onErr(e));
    return r ? onOk() : false;
  }
  function loadSlot(n) {
    if (turnRunning()) return false;
    const env = Storage.loadSlot(n);
    if (!env) return false;
    const bad = e => { UI.warn('That save could not be loaded: ' + e.message); return false; };
    let r;
    try { r = enter(env); } catch (e) { return bad(e); }
    return settle(r, () => { UI.toast(`Loaded "${env.name}".`); return true; }, bad);
  }
  /* Saves screen, "Restore previous": the game the autosave held before.
     The one there now becomes the previous one, so nothing is lost and
     nothing needs asking. */
  function restorePrevious() {
    if (turnRunning()) return false;
    const env = Storage.loadPrevious();
    if (!env) { UI.toast('There is no previous autosave.'); return false; }
    try { load(env); } catch (e) { UI.warn('The previous autosave could not be loaded: ' + e.message); return false; }
    UI.toast('Restored the previous autosave.');
    return true;
  }
  /* Settings, "Re-read this game with the latest rules": the loaded game is
     brought up to date (or re-read at the current version) on the game
     screen, where the feed shows how it went. */
  function updateGame() {
    if (turnRunning()) return Promise.resolve({ ok: false, reason: 'busy' });
    if (!inGame || !State.current || State.muted) return Promise.resolve({ ok: false, reason: 'no game' });
    UI.showScreen('game');
    return Pipeline.updateGame();
  }
  /* The title screen's "Update this game" and the Saves screen's Update:
     load that save ('autosave' or a slot number) and update it. The game
     stays loaded and is autosaved; a slot is also written back under its
     name, so it no longer shows as older. */
  async function updateSave(which) {
    if (turnRunning()) return { ok: false, reason: 'busy' };
    const slot = which === 'autosave' ? 0 : toInt(which);
    const env = slot ? Storage.loadSlot(slot) : Storage.loadAutosave();
    if (!env) { UI.toast('There is no such save.'); return { ok: false, reason: 'missing' }; }
    if (!(await (slot ? loadSlot(slot) : continueGame()))) return { ok: false, reason: 'load' };
    const r = await Pipeline.updateGame();
    if (r.ok && slot && State.current) { if (Storage.saveSlot(slot, env.name)) UI.toast(`Updated "${env.name}".`); }
    return r;
  }
  /* The player sets someone's pronouns (a card's chips, /pronouns): through
     the engine, which turns a gendered relation and role with them. A quiet
     line in the story; no turn, no undo step. */
  /* Why UI.canAct said no, as a reason code. */
  function refusal() { return Storage.readOnly ? 'read-only' : Pipeline.busy ? 'busy' : 'no game'; }
  function setPronouns(npcId, pronouns) {
    // The one guard (UI.canAct): never in a read-only tab, without a game on screen, or while a turn runs.
    if (!UI.canAct({ say: true })) return { ok: false, reason: refusal() };
    const n = State.current && State.npc(npcId);
    if (!n) return { ok: false, reason: 'missing' };
    const p = validPronouns(String(pronouns || '').toLowerCase().replace(/\/.*$/, ''));
    if (!p) { UI.feed.notice('Pronouns are she, he or they.'); return { ok: false, reason: 'usage' }; }
    if (n.pronouns === p) { UI.feed.notice(`${n.name} already goes by ${pronounLabel(p)}.`); return { ok: true, same: true }; }
    const r = State.apply({ fixPeople: [{ npcId: n.id, pronouns: p }] });
    if (r.rejected.length) { UI.feed.notice(`Could not change that: ${r.rejected[0].reason}`); return { ok: false, reason: 'rejected' }; }
    const role = n.role ? ` (${lowerFirst(n.role).split(/[,;]/)[0].trim()})` : '';
    UI.feed.quiet(`${n.name} goes by ${pronounLabel(p)} now${role}.`);
    return { ok: true };
  }
  /* The player edits someone (the People card's editor, /edit): one
     State.apply({ editPerson }) with source 'player' after one snapshot,
     so one /undo takes the whole edit back; when nothing changed the
     snapshot goes again. A quiet line names what changed ("Edited Mavis
     Toler: pronouns, role, home."); a refusal restores the state exactly
     and the feed gives the engine's reason. No turn and no API call.
     Returns { ok, fields } or { ok: false, reason, why }. */
  function editPerson(npcId, fields) {
    // The one guard (UI.canAct): never in a read-only tab, without a game on screen, or while a turn runs.
    if (!UI.canAct({ say: true })) { const reason = refusal(); return { ok: false, reason, why: reason === 'read-only' ? 'this tab is read-only' : reason === 'busy' ? BUSY_NOTICE.replace(/\.$/, '') : 'there is no game in progress' }; }
    const n = State.current && !State.muted ? State.npc(npcId) : null;
    if (!n) return { ok: false, reason: 'missing' };
    const was = n.name;
    const snap = State.snapshot();
    // Wave 30: a line of what is held between them deleted in the editor is voided in the same step (leverageSet).
    const voids = Array.isArray(fields && fields.voidLeverage) ? fields.voidLeverage.filter(x => typeof x === 'string') : [];
    const edit = Object.assign({}, fields, { npcId });
    delete edit.voidLeverage;
    const diff = Object.keys(edit).length > 1 ? { editPerson: edit } : {};
    if (voids.length) diff.effects = voids.map(id => ({ op: 'leverageSet', id, status: 'void' }));
    const r = State.quietly(() => State.apply(diff, { source: 'player' }));
    if (r.rejected.length) {
      State.restore(snap);
      const why = r.rejected[0].reason;
      UI.feed.notice(`${was} was not changed: ${why}.`);
      return { ok: false, reason: 'rejected', why };
    }
    const e = (r.edited || [])[0] || (voids.length ? { fields: [] } : null);
    if (!e || JSON.stringify(State.current) === snap) { State.restore(snap); return { ok: true, same: true, fields: [] }; }
    const done = e.fields.concat(voids.length ? ['what is held'] : []);
    UI.feed.quiet(`Edited ${State.npc(npcId).name}: ${done.join(', ')}.`);
    return { ok: true, fields: done };
  }
  /* The title screen (the menu's Title screen, Settings' Quit). Not with a
     hand on the table (wave 11, H1): the turn waits for the player's Draw
     or Fold, so nothing could be loaded or started until a reload; the
     game stays, with a notice, and nothing changes. The notice goes above
     the table, in view with its head, which takes the focus (wave 12, M1
     and L6: on a phone it was below the fold, under the "New" pill, and
     the focus fell to the page). */
  const HAND_TITLE = 'Finish the hand first: Draw or Fold (Stop folds).';
  // Wave 13: hold'em's buttons, and the chooser (no card dealt yet).
  const HAND_TITLE_HOLDEM = 'Finish the hand first: play it out or Fold (Stop folds).';
  const HAND_TITLE_CHOOSE = 'Pick a game first, or Stop to leave the table (nothing lost).';
  function quitToTitle() {
    if (Pipeline.handOpen) {
      if (UI.screen !== 'game') UI.showScreen('game');
      UI.feed.handNotice(Pipeline.handKind === 'choose' ? HAND_TITLE_CHOOSE : (Pipeline.handKind === 'holdem' || Pipeline.handKind === 'drawbet') ? HAND_TITLE_HOLDEM : HAND_TITLE);
      return false;
    }
    inGame = false;
    UI.showScreen('title');
    return true;
  }
  /* Test and console shortcut: create and begin without the form. */
  function quickStart(character, opts) { return prepare(character, opts) ? begin() : null; }
  return { boot, newGame, prepare, cancelPrepare, begin, enter, continueGame, loadSlot, restorePrevious, updateGame, updateSave, setPronouns, editPerson, quitToTitle, quickStart, flushNotes, playHere, newerRules, BUSY_NOTICE, NEWER_NOTICE, inGame: () => inGame };
})();

