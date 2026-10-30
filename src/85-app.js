// ===== Module: App =====
/* Boot and screen routing. A new game is prepared silently at "Review"
   (so the summary card can name the loose-end NPCs) and committed on Begin. */
const App = (() => {
  let inGame = false;
  /* Loading or starting a game while a turn waits on the API would let that
     turn finish (or roll back) on the wrong game and its autosave overwrite
     the one just loaded, so these entry points refuse until it is over (the
     UI disables their controls meanwhile). */
  const BUSY_NOTICE = 'Wait for the current turn to finish.';
  function turnRunning() {
    if (!Pipeline.busy) return false;
    UI.toast(BUSY_NOTICE);
    return true;
  }
  function urlSeed() {
    try { return toInt(new URLSearchParams(window.location.search).get('seed')); } catch (e) { return null; }
  }
  function boot() {
    Storage.init();
    UI.init();
    State.onChange(() => { Storage.autosave(); UI.renderGame(); });
    UI.showScreen('title');
  }
  function newGame() {
    if (turnRunning()) return false;
    UI.Create.start();
    UI.showScreen('create');
    return true;
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
     that fails, the local opening text is used. */
  function begin() {
    const s = State.current;
    if (!s || !State.muted) throw new Error('no character prepared');
    State.commit();
    inGame = true;
    const live = !Storage.settings().mockMode && !!Storage.getApiKey();
    if (live) {
      State.apply({ journalEntry: `Arrived in ${s.meta.townName}.` });
      UI.rebuildFeed();
      UI.showScreen('game');
      Pipeline.arrival();
      return State.current;
    }
    State.apply({
      logEntry: { input: '', roll: null, narration: Town.openingScene(s), day: s.time.day, phase: s.time.phase },
      journalEntry: `Arrived in ${s.meta.townName}.`
    });
    UI.rebuildFeed();
    UI.showScreen('game');
    return State.current;
  }
  function enter(env) {
    if (turnRunning()) return false;
    State.load(env.state, env.town);
    inGame = true;
    UI.rebuildFeed();
    UI.showScreen('game');
    return true;
  }
  function continueGame() {
    if (turnRunning()) return false;
    const env = Storage.loadAutosave();
    if (!env) { UI.toast('There is no autosave yet.'); return false; }
    try { enter(env); return true; } catch (e) { UI.warn('The autosave could not be loaded: ' + e.message); return false; }
  }
  function loadSlot(n) {
    if (turnRunning()) return false;
    const env = Storage.loadSlot(n);
    if (!env) return false;
    try { enter(env); } catch (e) { UI.warn('That save could not be loaded: ' + e.message); return false; }
    UI.toast(`Loaded "${env.name}".`);
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
    if (!(slot ? loadSlot(slot) : continueGame())) return { ok: false, reason: 'load' };
    const r = await Pipeline.updateGame();
    if (r.ok && slot && State.current) { if (Storage.saveSlot(slot, env.name)) UI.toast(`Updated "${env.name}".`); }
    return r;
  }
  /* The player sets someone's pronouns (a card's chips, /pronouns): through
     the engine, which turns a gendered relation and role with them. A quiet
     line in the story; no turn, no undo step. */
  function setPronouns(npcId, pronouns) {
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
    if (turnRunning()) return { ok: false, reason: 'busy', why: BUSY_NOTICE.replace(/\.$/, '') };
    const n = State.current && !State.muted ? State.npc(npcId) : null;
    if (!n) return { ok: false, reason: 'missing' };
    const was = n.name;
    const snap = State.snapshot();
    const r = State.apply({ editPerson: Object.assign({}, fields, { npcId }) }, { source: 'player' });
    if (r.rejected.length) {
      State.restore(snap);
      const why = r.rejected[0].reason;
      UI.feed.notice(`${was} was not changed: ${why}.`);
      return { ok: false, reason: 'rejected', why };
    }
    const e = (r.edited || [])[0];
    if (!e || JSON.stringify(State.current) === snap) { State.restore(snap); return { ok: true, same: true, fields: [] }; }
    UI.feed.quiet(`Edited ${State.npc(npcId).name}: ${e.fields.join(', ')}.`);
    return { ok: true, fields: e.fields };
  }
  function quitToTitle() { inGame = false; UI.showScreen('title'); }
  /* Test and console shortcut: create and begin without the form. */
  function quickStart(character, opts) { return prepare(character, opts) ? begin() : null; }
  return { boot, newGame, prepare, cancelPrepare, begin, enter, continueGame, loadSlot, updateGame, updateSave, setPronouns, editPerson, quitToTitle, quickStart, BUSY_NOTICE, inGame: () => inGame };
})();

