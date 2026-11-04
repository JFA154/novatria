// ===== Module: Storage =====
/* localStorage: settings, one autosave (after every turn: State batches a
   turn's changes; changes outside a turn save at once) and three
   named slots. The API key lives in localStorage only when "Remember on this
   device" is ticked, otherwise in sessionStorage; it is never part of a save
   or an export. Every access is wrapped; a failure shows a visible warning.
   Before the autosave is overwritten by a different game (another
   meta.createdAt or seed), the old one is copied to novatria.autosave.prev,
   so New game, Import and Load can always be taken back once (Saves screen,
   "Restore previous"). Another tab writing the autosave makes this tab read
   only (UI.otherTab) until the player chooses to play here.
   Wave 48: the saves kept in this browser (autosave, previous autosave,
   slots) hold their town copy by reference (townRef: State.townHash of its
   JSON), each version once under novatria.town.<hash>, shared by every save
   that uses it, and dropped once none does (sweepTowns); an export (and so
   an imported file) still carries the town in full, as documented, and a
   save with its town inline is read as before. Out of room (a QuotaExceededError, here or
   in IndexedDB): the feed says so once ("This device is out of room for
   saves; export your game."), the game plays on, and the autosave is kept
   before the previous autosave (the previous one goes to make room). */
const Storage = (() => {
  const PREFIX = 'novatria.';
  const KEYS = { settings: PREFIX + 'settings', apiKey: PREFIX + 'apiKey', autosave: PREFIX + 'autosave', prev: PREFIX + 'autosave.prev', slot: n => PREFIX + 'slot.' + n, town: h => PREFIX + 'town.' + h };
  const SLOTS = 3;
  const SAVE_KIND = 'novatria-save';
  /* An imported file larger than this is refused before it is read. */
  const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
  /* Defaults chosen for the best play-through rather than the cheapest: the
     current Opus writes the story, the current Sonnet does the parsing,
     bookkeeping and chronicle, and the roles that need judgement think a
     little harder. settingsVersion lets init() upgrade settings saved under
     the previous defaults (v1: Sonnet narrator, Haiku parser, all effort low)
     while keeping anything the player typed in themselves. narrationStyle
     (casual or literary) and inputMode (the composer's Do / Say toggle,
     remembered per browser) are newer fields: a settings object without
     them gets the defaults, and the version is not involved.
     mockMode (the offline demo) is not a default any more: with no setting
     saved it is on only while there is no key (nothing else can run), and
     New game asks first (playChoice: null until the player picks 'demo' or
     'claude'); entering a key turns it off (UI). lastExportAt (ISO) feeds
     "Last exported" on the Saves screen; persistAsked: navigator.storage
     .persist() was asked for once; tipSeen: the first-turn tip was shown. */
  const SETTINGS_VERSION = 2;
  const V1_DEFAULTS = { narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5' };
  const DEFAULTS = {
    settingsVersion: SETTINGS_VERSION,
    narratorModel: 'claude-opus-5-5',
    parserModel: 'claude-sonnet-5-5',
    effort: { narrator: 'medium', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' },
    showRolls: true,
    permadeath: false,
    theme: null, // null: follow prefers-color-scheme
    textSize: 'M',
    narrationStyle: 'casual',
    inputMode: 'do',
    mockMode: true,
    playChoice: null,
    rememberKey: false,
    panelCollapsed: false,
    lastExportAt: null,
    persistAsked: false,
    tipSeen: false,
    // Wave 28: the Debug view's export of bookkeeper turns (Pipeline keeps the last 200 in memory while this is on).
    keepPackets: false,
    // Wave 30: rules version 9's update first rewrites memories in the short form (version 2's re-read, one call); off by default.
    rereadMemories: false,
    // Wave 43: Settings, Spending: "Pause and ask at $X" for a game's cost (dollars; null: off).
    spendCeiling: null
  };
  /* Settings, "Quality": the models and effort each preset sets. A
     settings object that matches none of them is "custom". */
  const PRESETS = {
    thrifty: { narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' } },
    standard: { narratorModel: DEFAULTS.narratorModel, parserModel: DEFAULTS.parserModel, effort: Object.assign({}, DEFAULTS.effort) },
    best: { narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'high', parser: 'medium', bookkeeper: 'high', chronicle: 'high' } }
  };
  let settings = deepCopy(DEFAULTS);
  let apiKey = '';
  let failed = false;
  /* Read only: another tab wrote the autosave since this tab last did. */
  let readOnly = false;
  /* The game (gameId) the autosave holds as far as this tab knows, so a
     turn's autosave does not have to read the old one back. */
  let knownAutosaveId = null;

  /* Wave 44: after wipeAll() every read and write goes nowhere until the page reloads, so nothing this page still holds is written back. */
  let wiped = false;
  const NO_AREA = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  function area(which) { if (wiped) return NO_AREA; return which === 'session' ? window.sessionStorage : window.localStorage; }
  function fail(msg) { failed = true; UI.warn(msg); }
  function read(key, which) {
    try { return area(which).getItem(key); }
    catch (e) { console.warn('[Storage] read failed', key, e); fail('This browser blocked access to its storage, so saves and settings may not load. You can still export your game from Save / Load.'); return null; }
  }
  const SAVE_FAILED = 'Saving failed: this browser\'s storage is full or blocked. Export your game from Save / Load so nothing is lost.';
  /* Wave 48: a write refused for want of room (the name differs by browser). */
  function isQuota(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
  }
  const OUT_OF_ROOM = 'This device is out of room for saves; export your game.';
  let roomSaid = false;
  /* Said once a page, in the feed, while a game is on screen (out of a game the banner's "Saving failed" says it). */
  function outOfRoom() {
    if (roomSaid) return;
    try { if (App.inGame() && State.current) { UI.feed.notice(OUT_OF_ROOM); roomSaid = true; } } catch (e) { console.warn('[Storage]', OUT_OF_ROOM, e); }
  }
  function write(key, value, which) {
    try { area(which).setItem(key, value); return true; }
    catch (e) { console.warn('[Storage] write failed', key, e); fail(SAVE_FAILED); if (isQuota(e)) outOfRoom(); return false; }
  }
  function remove(key, which) {
    try { area(which).removeItem(key); return true; }
    catch (e) { console.warn('[Storage] remove failed', key, e); return false; }
  }

  // ----- settings -----
  function cleanSettings(raw) {
    const s = deepCopy(DEFAULTS);
    if (!isObj(raw)) return s;
    const legacy = !(typeof raw.settingsVersion === 'number' && raw.settingsVersion >= SETTINGS_VERSION);
    const narr = typeof raw.narratorModel === 'string' ? raw.narratorModel.trim() : '';
    const pars = typeof raw.parserModel === 'string' ? raw.parserModel.trim() : '';
    if (narr && !(legacy && narr === V1_DEFAULTS.narratorModel)) s.narratorModel = narr;
    if (pars && !(legacy && pars === V1_DEFAULTS.parserModel)) s.parserModel = pars;
    const allLow = isObj(raw.effort) && Object.keys(s.effort).every(k => raw.effort[k] === 'low' || raw.effort[k] === undefined);
    if (isObj(raw.effort) && !(legacy && allLow)) for (const k of Object.keys(s.effort)) if (['low', 'medium', 'high'].includes(raw.effort[k])) s.effort[k] = raw.effort[k];
    for (const k of ['showRolls', 'permadeath', 'mockMode', 'rememberKey', 'panelCollapsed', 'persistAsked', 'tipSeen', 'keepPackets', 'rereadMemories']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (raw.theme === 'dark' || raw.theme === 'parchment') s.theme = raw.theme;
    if (['S', 'M', 'L'].includes(raw.textSize)) s.textSize = raw.textSize;
    if (raw.narrationStyle === 'casual' || raw.narrationStyle === 'literary') s.narrationStyle = raw.narrationStyle;
    if (raw.inputMode === 'do' || raw.inputMode === 'say') s.inputMode = raw.inputMode;
    if (raw.playChoice === 'demo' || raw.playChoice === 'claude') s.playChoice = raw.playChoice;
    if (typeof raw.lastExportAt === 'string' && !Number.isNaN(Date.parse(raw.lastExportAt))) s.lastExportAt = raw.lastExportAt;
    // Wave 43: a ceiling is a whole number of cents from 1 cent to $10,000; anything else is off.
    if (Number.isFinite(raw.spendCeiling) && raw.spendCeiling >= 0.01 && raw.spendCeiling <= 10000) s.spendCeiling = Math.round(raw.spendCeiling * 100) / 100;
    return s;
  }
  function init() {
    const raw = read(KEYS.settings);
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
    settings = cleanSettings(parsed);
    apiKey = (settings.rememberKey ? read(KEYS.apiKey, 'local') : read(KEYS.apiKey, 'session')) || '';
    // Nothing chosen yet: the demo only while there is no key.
    if (!(isObj(parsed) && typeof parsed.mockMode === 'boolean')) settings.mockMode = !apiKey;
    try { window.addEventListener('storage', onStorageEvent); } catch (e) { /* no window events */ }
    undoInit();
  }
  function saveSettings(patch) {
    const next = Object.assign({}, settings, patch || {});
    if (patch && patch.effort) next.effort = Object.assign({}, settings.effort, patch.effort);
    settings = cleanSettings(next);
    write(KEYS.settings, JSON.stringify(settings));
    return settings;
  }
  /* 'thrifty' | 'standard' | 'best' | 'custom' for the current settings. */
  function presetOf(s) {
    s = s || settings;
    for (const k of Object.keys(PRESETS)) {
      const p = PRESETS[k];
      if (s.narratorModel === p.narratorModel && s.parserModel === p.parserModel && Object.keys(p.effort).every(r => s.effort[r] === p.effort[r])) return k;
    }
    return 'custom';
  }
  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return settings;
    return saveSettings({ narratorModel: p.narratorModel, parserModel: p.parserModel, effort: Object.assign({}, p.effort) });
  }
  function effectiveTheme() {
    if (settings.theme) return settings.theme;
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'parchment' : 'dark'; } catch (e) { return 'dark'; }
  }
  function setApiKey(key, remember) {
    apiKey = typeof key === 'string' ? key.trim() : '';
    const keep = remember === true;
    if (keep) { if (apiKey) write(KEYS.apiKey, apiKey, 'local'); else remove(KEYS.apiKey, 'local'); remove(KEYS.apiKey, 'session'); }
    else { if (apiKey) write(KEYS.apiKey, apiKey, 'session'); else remove(KEYS.apiKey, 'session'); remove(KEYS.apiKey, 'local'); }
    if (settings.rememberKey !== keep) saveSettings({ rememberKey: keep });
  }
  /* Ask the browser, once, to keep this site's storage when space runs low. */
  function requestPersist() {
    if (settings.persistAsked) return false;
    saveSettings({ persistAsked: true });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* not offered */ }
    return true;
  }

  // ----- saves -----
  /* Which game a state is: the same game keeps its createdAt and seed through every turn and save. */
  function gameId(st) { return isObj(st) && isObj(st.meta) ? `${st.meta.createdAt || ''}|${st.meta.seed}` : null; }
  function summaryOf(st) {
    const l = st.locations.find(x => x.id === st.player.locationId);
    return { player: st.player.name, background: st.player.background, day: st.time.day, phase: st.time.phase, location: l ? l.name : '', turn: st.meta.turn, town: st.meta.townName };
  }
  // Wave 48: an envelope's fields before its state and town (a save kept here writes the live state, uncopied).
  function header(name) {
    const st = State.current;
    if (!st) throw new Error('no game in progress');
    return { kind: SAVE_KIND, saveVersion: 1, name: cleanText(name, 40) || `${st.player.name}, Day ${st.time.day}`, savedAt: new Date().toISOString(), summary: summaryOf(st) };
  }
  function envelope(name) {
    return Object.assign(header(name), { state: deepCopy(State.current), town: deepCopy(State.town || TOWN_DATA) });
  }
  function serialise(env) {
    let json = JSON.stringify(env);
    // Belt and braces: the key is never in state, but never let it leave either.
    if (apiKey && apiKey.length >= 8 && json.includes(apiKey)) json = json.split(apiKey).join('[redacted]');
    return json;
  }
  /* ----- the town kept once (wave 48) -----
     A save in this browser is the export's envelope with townRef in place
     of town: { kind, saveVersion, name, savedAt, summary, townRef, state },
     its town under KEYS.town(townRef). lastTown: the JSON and hash of the
     town this page last wrote, so an unchanged town is not hashed again. */
  let lastTown = { json: null, hash: null };
  function hashOf(json) {
    if (json !== lastTown.json) lastTown = { json, hash: State.townHash(json) };
    return lastTown.hash;
  }
  // The townRef a stored save's text names (it comes before the state, so only the head is read).
  const TOWN_REF = /,"townRef":"([0-9a-z-]+)","state":/;
  function refOf(raw) {
    if (typeof raw !== 'string') return null;
    const m = TOWN_REF.exec(raw.slice(0, 8192));
    return m ? m[1] : null;
  }
  /* Every town copy no save names any more is removed. */
  function sweepTowns() {
    const keep = new Set();
    const keys = [KEYS.autosave, KEYS.prev];
    for (let n = 1; n <= SLOTS; n++) keys.push(KEYS.slot(n));
    const all = [];
    try {
      const ls = area();
      for (const k of keys) { const r = refOf(ls.getItem(k)); if (r) keep.add(r); }
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(KEYS.town(''))) all.push(k); }
    } catch (e) { return; }
    for (const k of all) if (!keep.has(k.slice(KEYS.town('').length))) remove(k);
  }
  /* The previous autosave goes to make room for the autosave (wave 48). */
  function dropPrevious() {
    try { if (area().getItem(KEYS.prev) === null) return false; } catch (e) { return false; }
    remove(KEYS.prev);
    sweepTowns();
    console.warn('[Storage] the previous autosave was removed to make room for the autosave');
    return true;
  }
  // A write that says nothing yet (writeSave decides); quotaHit: the last one failed for want of room.
  let quotaHit = false;
  function tryWrite(key, value) {
    quotaHit = false;
    try { area().setItem(key, value); return true; }
    catch (e) { console.warn('[Storage] write failed', key, e); quotaHit = isQuota(e); return false; }
  }
  /* A save written as kept here (town by reference): its town first (when
     not there already), then the save, then the town checked again (another
     tab may have swept it in between). roomy (the autosave): on a quota the
     previous autosave goes and it is tried once more. */
  function writeSave(key, head, roomy) {
    const town = JSON.stringify(State.town || TOWN_DATA);
    const ref = hashOf(town);
    const text = serialise(Object.assign({}, head, { townRef: ref, state: State.current }));
    const tk = KEYS.town(ref);
    const has = () => { try { return area().getItem(tk) !== null; } catch (e) { return false; } };
    const once = () => (has() || tryWrite(tk, town)) && tryWrite(key, text) && (has() || tryWrite(tk, town));
    let ok = once();
    // Out of room: said once, even when dropping the previous autosave made room (it is gone).
    if (!ok && quotaHit) { outOfRoom(); if (roomy && dropPrevious()) ok = once(); }
    if (!ok) { fail(SAVE_FAILED); if (quotaHit) outOfRoom(); return false; }
    sweepTowns();
    return true;
  }
  /* State.validateShape's answer as a list of problems: today a list; a
     deeper check may answer { ok, reason } or a string. */
  function shapeProblems(st, town) {
    let v;
    try { v = State.validateShape(st, town); } catch (e) { return [e.message || 'it could not be checked']; }
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') return v ? [v] : [];
    if (isObj(v) && v.ok === false) return [String(v.reason || (Array.isArray(v.errors) ? v.errors.join('; ') : 'it is not the right shape'))];
    return [];
  }
  /* what: how the reason names it ('That file' for an import, 'The saved
     game' for one kept in this browser). */
  function parseEnvelope(text, what) {
    const it = what || 'That file';
    let env;
    try { env = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error(`${it} is not valid JSON.`); }
    if (!isObj(env)) throw new Error(`${it} is not a saved game.`);
    if (env.kind !== SAVE_KIND && isObj(env.meta) && isObj(env.player)) env = { kind: SAVE_KIND, saveVersion: 1, name: 'Imported', state: env, town: null };
    if (env.kind !== SAVE_KIND || !isObj(env.state)) throw new Error(`${it} is not a saved game.`);
    // Wave 48: a save kept in this browser names its town (townRef); it comes back in full, as an export has it.
    if (!isObj(env.town) && typeof env.townRef === 'string') {
      let t = null;
      try { const raw = area().getItem(KEYS.town(env.townRef)); t = raw ? JSON.parse(raw) : null; } catch (e) { t = null; }
      // Kept here and its town gone: damaged. A file (an import) is read as one without a town, as before.
      if (!isObj(t) && what) throw new Error(`${it} is damaged: its copy of the town is missing`);
      env.town = t;
    }
    delete env.townRef;
    const errs = shapeProblems(env.state, isObj(env.town) ? env.town : undefined);
    if (errs.length) throw new Error(`${what ? it : 'That save'} is damaged: ${errs.join('; ')}`);
    delete env.apiKey;
    delete env.settings;
    if (!isObj(env.town)) env.town = deepCopy(TOWN_DATA);
    return env;
  }
  /* Copy the autosave to .prev when the game about to be written is a different one. */
  function keepPrevious(st) {
    const id = gameId(st);
    if (knownAutosaveId === id) return;
    const raw = read(KEYS.autosave);
    if (raw) {
      let old = null;
      try { old = JSON.parse(raw); } catch (e) { old = null; }
      const oldId = old && isObj(old.state) ? gameId(old.state) : null;
      // Only a readable autosave of another game is kept: an unreadable one never replaces a good previous copy.
      if (oldId && oldId !== id) {
        try { area().setItem(KEYS.prev, raw); }
        catch (e) { console.warn('[Storage] could not keep the previous autosave', e); if (isQuota(e)) outOfRoom(); }
      }
    }
    knownAutosaveId = id;
  }
  /* Wave 48: the town by reference (writeSave); on a quota the previous autosave makes room. */
  function autosave() {
    if (!State.current || State.muted || readOnly) return false;
    keepPrevious(State.current);
    const ok = writeSave(KEYS.autosave, header('Autosave'), true);
    if (ok) knownAutosaveId = gameId(State.current);
    return ok;
  }
  function peek(key) {
    const raw = read(key);
    if (!raw) return null;
    try { return parseEnvelope(raw, 'The saved game'); } catch (e) { return { broken: true, error: e.message }; }
  }
  function hasAutosave() { const e = peek(KEYS.autosave); return !!(e && !e.broken); }
  function loadAutosave() { const e = peek(KEYS.autosave); return e && !e.broken ? e : null; }
  /* The autosave as stored, damaged or not (title screen: "Download it"). */
  function rawAutosave() { return read(KEYS.autosave); }
  function loadPrevious() { const e = peek(KEYS.prev); return e && !e.broken ? e : null; }
  function saveSlot(n, name) {
    if (!(n >= 1 && n <= SLOTS)) throw new Error('slot must be 1 to ' + SLOTS);
    const head = header(name);
    return writeSave(KEYS.slot(n), head) ? Object.assign(head, { state: deepCopy(State.current), town: deepCopy(State.town || TOWN_DATA) }) : null;
  }
  function loadSlot(n) { const e = peek(KEYS.slot(n)); return e && !e.broken ? e : null; }
  function deleteSlot(n) { const ok = remove(KEYS.slot(n)); sweepTowns(); return ok; }
  function listSlots() {
    const out = [];
    for (let n = 1; n <= SLOTS; n++) out.push(peek(KEYS.slot(n)));
    return out;
  }
  /* Is this game (a state, or an envelope's) kept in a named slot? */
  function inSlot(st) {
    const id = gameId(st);
    return !!id && listSlots().some(e => e && !e.broken && gameId(e.state) === id);
  }
  /* /save <name>: same name overwrites, else the first empty slot. */
  function saveNamed(name) {
    const slots = listSlots();
    const want = cleanText(name, 40).toLowerCase();
    let n = slots.findIndex(e => e && !e.broken && e.name.toLowerCase() === want) + 1;
    if (!n) n = slots.findIndex(e => !e || e.broken) + 1;
    if (!n) return { ok: false, full: true };
    const env = saveSlot(n, name);
    return env ? { ok: true, slot: n, name: env.name } : { ok: false };
  }
  function findSlot(ref) {
    const r = String(ref || '').trim().toLowerCase();
    const num = toInt(r);
    if (num >= 1 && num <= SLOTS) return num;
    const i = listSlots().findIndex(e => e && !e.broken && e.name.toLowerCase() === r);
    return i >= 0 ? i + 1 : 0;
  }
  function exportJson() { return serialise(envelope('Export')); }
  function exportFileName() {
    const st = State.current;
    // "locketts-ferry-tomas-reed-day-1.json": an apostrophe is dropped, not made a break.
    const slug = t => slugify(String(t || '').replace(/['’‘`]/g, ''));
    return `${slug(st.meta.townName)}-${slug(st.player.name)}-day-${st.time.day}.json`.replace(/_/g, '-');
  }
  function download(text, name) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  }
  function exportSave() {
    const name = download(JSON.stringify(JSON.parse(exportJson()), null, 2), exportFileName());
    saveSettings({ lastExportAt: new Date().toISOString() });
    return name;
  }
  /* The damaged autosave, byte for byte, so it can be mended by hand. */
  function downloadAutosave() {
    let raw = rawAutosave();
    // Wave 48: with its town put back in, when the text reads and the town is there (the file then imports anywhere).
    try {
      const env = raw ? JSON.parse(raw) : null;
      const t = isObj(env) && typeof env.townRef === 'string' ? area().getItem(KEYS.town(env.townRef)) : null;
      if (t) { delete env.townRef; env.town = JSON.parse(t); raw = JSON.stringify(env); }
    } catch (e) { /* as stored */ }
    return raw ? download(raw, 'damaged-autosave.json') : null;
  }
  async function importFile(file) {
    if (!file) throw new Error('No file chosen.');
    if (file.size > IMPORT_MAX_BYTES) throw new Error(`That file is too big to be a saved game (${Math.round(file.size / 1024 / 1024)} MB; the limit is 5 MB).`);
    const text = await file.text();
    return parseEnvelope(text);
  }
  // ----- another tab -----
  /* The storage event fires here only when another tab (same browser) writes. */
  function onStorageEvent(e) {
    if (!e || e.key !== KEYS.autosave) return;
    try { if (e.storageArea && e.storageArea !== window.localStorage) return; } catch (x) { return; }
    knownAutosaveId = null;
    if (App.inGame() && State.current && !State.muted) setReadOnly(true);
    else if (UI.screen === 'title') UI.renderTitle();
  }
  function setReadOnly(on) {
    readOnly = !!on;
    // Wave 48: another tab writes the undo stores now, so what this page knew of them is not known.
    if (readOnly) kept = null;
    if (UI.otherTab) UI.otherTab(readOnly);
    // A hand open here is void now (wave 12, L3): this tab can save nothing, and the other tab holds the game.
    if (readOnly && Pipeline.handOpen) Pipeline.voidHand();
    return readOnly;
  }
  /* The last step of "Play here instead" (App.playHere loads the newer
     game first) and of a game loaded or begun in a read-only tab: this tab
     writes the autosave again, and so the other tab goes read only. */
  function claim() {
    setReadOnly(false);
    knownAutosaveId = null;
    kept = null;
    return autosave();
  }
  /* An autosave this tab cannot read is kept as the previous autosave before anything is written over it. */
  function keepAside(raw) {
    if (typeof raw !== 'string' || !raw) return false;
    try { area().setItem(KEYS.prev, raw); return true; } catch (e) { console.warn('[Storage] could not keep the unreadable autosave', e); if (isQuota(e)) outOfRoom(); return false; }
  }
  /* Never write this tab's (older) game over the other tab's: App.playHere. */
  function takeOver() { return App.playHere(); }
  /* A hand on the table (wave 11, M1: once the cards are dealt the ante is
     in). Written when the cards are dealt and again once the hand is
     played, removed when its turn ends; a page closed in between leaves it
     here for the next load of that game (Pipeline.resumeHand), so a reload
     never takes a hand back. Quietly nothing when storage is blocked. */
  const HAND_KEY = PREFIX + 'hand';
  function holdHand(h) { if (readOnly) return false; try { area().setItem(HAND_KEY, JSON.stringify(h)); return true; } catch (e) { return false; } }
  function heldHand() { try { const raw = area().getItem(HAND_KEY); const h = raw ? JSON.parse(raw) : null; return isObj(h) ? h : null; } catch (e) { return null; } }
  /* token (wave 12, L3): drop it only if it is still that hand (another tab may have put its own there since). */
  function dropHand(token) {
    if (token !== undefined) { const h = heldHand(); if (!h || h.token !== token) return false; }
    try { area().removeItem(HAND_KEY); return true; } catch (e) { return false; }
  }
  /* This tab (wave 12, L3): kept in sessionStorage, so a reload is the same
     tab and another tab is not; a stored hand says which tab dealt it. */
  const TAB_KEY = PREFIX + 'tab';
  let tabId = null;
  function tab() {
    if (tabId) return tabId;
    try { tabId = area('session').getItem(TAB_KEY); } catch (e) { tabId = null; }
    if (!tabId) {
      tabId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      try { area('session').setItem(TAB_KEY, tabId); } catch (e) { /* this page only */ }
    }
    return tabId;
  }
  /* The undo stack, kept (wave 16: a phone reloads a tab left in the
     background, and /undo had nothing left). localStorage is too small (a
     step is the whole game, about 200-400 KB, and the stack holds 20), so
     it lives in IndexedDB: database "novatria", store "undo", one record,
     the current game's (State.undoRecord, keyed by its createdAt and seed,
     with the tab that wrote it), written a moment after the stack changes
     (UNDO_WRITE_MS; at once before another game takes this one's place,
     and when the page is hidden). Continue and Play here instead read it
     back (undoResume: only that game's steps, up to the turn loaded,
     State.resumeUndo); a new game, a slot, an import or the previous
     autosave start empty and clear it (undoReset). A tab another tab has
     taken over (read only) never writes it. Without IndexedDB (some private
     windows, some browsers on file://) or when it fails, nothing is said:
     the stack is this page's only, as before. The redo stack is never kept. */
  /* Wave 48: one record a step, not the whole stack rewritten each time.
     Database version 2 has three stores beside wave 16's "undo": "undoHead"
     (one record, key 'head': { v: 2, game, turn, ids (the steps in order),
     tab, savedAt }), "undoSteps" (one record a step, keyed by its id: { id,
     game, turn, json, th }) and "undoTowns" (one record a town version,
     keyed by its townHash: { th, json }). A write puts only the steps and
     towns not kept yet, deletes those gone (the oldest past the cap, the
     ones an undo took), and puts the head, in one transaction; kept is what
     this page knows the stores hold (null: not known, so the next write
     clears them all, wave 16's record too, and writes the whole stack: a
     new page, another game, after another tab, after a write that failed).
     undoResume reads this layout, or else wave 16's single record (a game
     mid-play on the older build keeps its undo), which the next write
     replaces. A quota on the write: outOfRoom, once. */
  const UNDO_DB = 'novatria';
  const UNDO_DB_VERSION = 2;
  const UNDO_STORE = 'undo';
  const UNDO_HEAD = 'undoHead';
  const UNDO_STEPS = 'undoSteps';
  const UNDO_TOWNS = 'undoTowns';
  const UNDO_ALL = [UNDO_STORE, UNDO_HEAD, UNDO_STEPS, UNDO_TOWNS];
  const UNDO_WRITE_MS = 250;
  let undoDbP = null;
  let undoTimer = null;
  let undoDirty = false;
  let undoReading = 0;
  let undoChain = Promise.resolve();
  let kept = null; // { game, ids: Set, ths: Set }: what the stores hold, as far as this page knows
  function undoDb() {
    if (undoDbP) return undoDbP;
    undoDbP = new Promise(resolve => {
      try {
        const req = window.indexedDB.open(UNDO_DB, UNDO_DB_VERSION);
        req.onupgradeneeded = () => { try { for (const n of UNDO_ALL) if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n); } catch (e) { /* none then */ } };
        req.onsuccess = () => { const db = req.result; try { db.onversionchange = () => db.close(); } catch (e) { /* fine */ } resolve(db); };
        req.onerror = e => { try { e.preventDefault(); } catch (x) { /* fine */ } resolve(null); };
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return undoDbP;
  }
  /* One transaction on the stores, after every one asked for before it.
     work(tx) returns a request whose result is the answer, a function that
     gives it once the transaction is done, or nothing. Resolves to that,
     or null whatever went wrong (a quota says so: outOfRoom). */
  function undoTx(mode, work) {
    const run = () => undoDb().then(db => new Promise(resolve => {
      if (!db) { resolve(null); return; }
      let got = null;
      let tx = null;
      try {
        tx = db.transaction(UNDO_ALL, mode);
        got = work(tx) || null;
        tx.oncomplete = () => resolve(typeof got === 'function' ? got() : got && got.result !== undefined ? got.result : null);
        tx.onabort = () => { if (isQuota(tx.error)) outOfRoom(); resolve(null); };
        tx.onerror = e => { try { e.preventDefault(); } catch (x) { /* fine */ } };
      } catch (e) {
        if (isQuota(e)) outOfRoom();
        try { if (tx) tx.abort(); } catch (x) { /* done already */ }
        resolve(null);
      }
    }));
    const p = undoChain.then(run, run);
    undoChain = p.catch(() => null);
    return p;
  }
  function onUndo(why) {
    if (why === 'switch') { undoFlush(); return; }
    undoDirty = true;
    if (!undoTimer) undoTimer = setTimeout(() => { undoTimer = null; undoFlush(true); }, UNDO_WRITE_MS);
  }
  /* The stack as State keeps it, written: only what changed since kept
     (worked out when the transaction starts, after every write before it). */
  function undoWrite(rec) {
    return undoTx('readwrite', tx => {
      const head = tx.objectStore(UNDO_HEAD);
      const steps = tx.objectStore(UNDO_STEPS);
      const towns = tx.objectStore(UNDO_TOWNS);
      const k = kept && kept.game === rec.game ? kept : null;
      kept = null; // not known until this transaction is done
      if (!k) { for (const n of UNDO_ALL) tx.objectStore(n).clear(); }
      const ids = new Set();
      const ths = new Set();
      for (const e of rec.entries) {
        ids.add(e.id);
        if (!k || !k.ids.has(e.id)) steps.put({ id: e.id, game: rec.game, turn: e.turn, json: e.json, th: e.th }, e.id);
        if (e.th) ths.add(e.th);
      }
      if (k) for (const id of k.ids) if (!ids.has(id)) steps.delete(id);
      for (const th of ths) if (!k || !k.ths.has(th)) towns.put({ th, json: rec.towns[th] }, th);
      if (k) for (const th of k.ths) if (!ths.has(th)) towns.delete(th);
      head.put({ v: 2, game: rec.game, turn: rec.turn, ids: rec.entries.map(e => e.id), tab: rec.tab, savedAt: rec.savedAt }, 'head');
      tx.addEventListener('complete', () => { kept = { game: rec.game, ids, ths }; });
      return () => true;
    });
  }
  /* Write the stack now (later: the timer's write, which waits for a read
     back that is still under way). */
  function undoFlush(later) {
    clearTimeout(undoTimer);
    undoTimer = null;
    if (!undoDirty) return false;
    if (undoReading) { if (later) undoTimer = setTimeout(() => { undoTimer = null; undoFlush(true); }, UNDO_WRITE_MS); return false; }
    undoDirty = false;
    if (readOnly) return false;
    const rec = State.undoRecord();
    if (!rec) return false;
    rec.tab = tab();
    rec.savedAt = new Date().toISOString();
    undoWrite(rec);
    return true;
  }
  /* A new game, a slot, an import or the previous autosave: an empty stack, written now over the one kept. */
  function undoReset() { undoDirty = true; return undoFlush(); }
  /* Everything in the stores, as one record of State.undoRecord's shape
     (v 2), or wave 16's record (v 1), or null; game: only that game's.
     Sets kept to what the stores hold when they hold the new layout. */
  function undoReadAll(game) {
    return undoTx('readonly', tx => {
      const h = tx.objectStore(UNDO_HEAD).get('head');
      const st = tx.objectStore(UNDO_STEPS).getAll();
      const tw = tx.objectStore(UNDO_TOWNS).getAll();
      const old = tx.objectStore(UNDO_STORE).getAll();
      return () => {
        const head = h.result;
        if (isObj(head) && Array.isArray(head.ids) && (!game || head.game === game)) {
          const byId = new Map();
          for (const x of Array.isArray(st.result) ? st.result : []) if (isObj(x) && typeof x.id === 'string') byId.set(x.id, x);
          const towns = {};
          for (const x of Array.isArray(tw.result) ? tw.result : []) if (isObj(x) && typeof x.th === 'string' && typeof x.json === 'string') towns[x.th] = x.json;
          kept = { game: head.game, ids: new Set(byId.keys()), ths: new Set(Object.keys(towns)) };
          const entries = head.ids.map(id => byId.get(id)).filter(isObj).map(x => ({ id: x.id, turn: x.turn, json: x.json, th: typeof x.th === 'string' ? x.th : null }));
          return { v: 2, game: head.game, turn: head.turn, tab: head.tab, savedAt: head.savedAt, entries, towns };
        }
        const rec = (Array.isArray(old.result) ? old.result : []).find(x => isObj(x) && (!game || x.game === game));
        return rec || null;
      };
    });
  }
  /* Continue, Play here instead: the stack kept for this game, read back
     under what was done since the load. Resolves to how many steps came back. */
  function undoResume() {
    const s = State.current;
    if (!s || State.muted) return Promise.resolve(0);
    const game = gameId(s);
    const gen = State.undoGen;
    undoReading += 1;
    return undoReadAll(game).then(rec => {
      undoReading -= 1;
      const n = isObj(rec) && rec.game === game ? State.resumeUndo(rec, gen) : 0;
      return n;
    }, () => { undoReading -= 1; return 0; });
  }
  /* The record as kept (tests, the console), or null: { v, game, tab,
     savedAt, turn, entries: [{ id, turn, json, th }], towns: [each town
     version's JSON, as the entries first name it] } (v 1: wave 16's record as stored). */
  function undoKept() {
    return undoReadAll(null).then(rec => {
      if (!isObj(rec) || rec.v !== 2) return rec;
      const towns = [];
      for (const e of rec.entries) if (e.th && typeof rec.towns[e.th] === 'string' && !towns.includes(rec.towns[e.th])) towns.push(rec.towns[e.th]);
      return Object.assign({}, rec, { towns });
    });
  }
  /* Every read and write asked for so far is done (tests). */
  function undoIdle() { return undoChain.then(() => null); }
  function undoInit() {
    State.onUndo(onUndo);
    const hide = () => undoFlush();
    try {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hide(); });
      window.addEventListener('pagehide', hide);
    } catch (e) { /* no page events */ }
  }
  /* Wave 44: Settings, "This device". forgetKey: the key out of both
     localStorage and sessionStorage, and New game asks how to play again
     (playChoice back to null); saves and the other settings stay. */
  function forgetKey() {
    apiKey = '';
    remove(KEYS.apiKey, 'local');
    remove(KEYS.apiKey, 'session');
    saveSettings({ rememberKey: false, playChoice: null });
    return true;
  }
  /* Every database the game keeps in IndexedDB: the undo store's, and any
     other whose name starts with it, where the browser can list them. */
  function gameDatabases() {
    const names = [UNDO_DB];
    try {
      if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
        return window.indexedDB.databases().then(list => {
          for (const x of Array.isArray(list) ? list : []) if (x && typeof x.name === 'string' && x.name.startsWith(UNDO_DB) && !names.includes(x.name)) names.push(x.name);
          return names;
        }, () => names);
      }
    } catch (e) { /* not offered */ }
    return Promise.resolve(names);
  }
  function deleteDatabase(name) {
    return new Promise(resolve => {
      let req;
      try { req = window.indexedDB.deleteDatabase(name); } catch (e) { resolve(false); return; }
      req.onsuccess = () => resolve(true);
      req.onerror = e => { try { e.preventDefault(); } catch (x) { /* fine */ } resolve(false); };
      // Another tab still holds it open: it closes on versionchange (undoDb), and the delete goes through then.
      req.onblocked = () => setTimeout(() => resolve(false), 1500);
    });
  }
  /* wipeAll: everything the game keeps in this browser goes (every
     novatria.* key in localStorage and sessionStorage: settings, the key,
     the autosave and the previous one, the slots, a hand on the table, this
     tab's id; and the IndexedDB undo database), and from then on this page
     writes nothing (area) until it is reloaded as a fresh profile (UI).
     Only the game's own keys: on file:// every page opened from disk shares
     these storages. Resolves to { ok, left } (what could not be removed). */
  async function wipeAll() {
    wiped = true;
    clearTimeout(undoTimer);
    undoTimer = null;
    undoDirty = false;
    apiKey = '';
    const left = [];
    for (const which of ['local', 'session']) {
      let st = null;
      try { st = which === 'session' ? window.sessionStorage : window.localStorage; } catch (e) { st = null; }
      if (!st) continue;
      try {
        const keys = [];
        for (let i = 0; i < st.length; i++) { const k = st.key(i); if (typeof k === 'string' && k.startsWith(PREFIX)) keys.push(k); }
        for (const k of keys) st.removeItem(k);
      } catch (e) { left.push(which + 'Storage'); }
    }
    // The undo database: this page's connection closed first, so the delete is not blocked by it.
    const open = undoDbP;
    undoDbP = Promise.resolve(null);
    try { const db = open ? await open : null; if (db) db.close(); } catch (e) { /* none open */ }
    try { await undoChain; } catch (e) { /* done either way */ }
    let idb = null;
    try { idb = window.indexedDB || null; } catch (e) { idb = null; }
    if (idb) for (const name of await gameDatabases()) if (!(await deleteDatabase(name))) left.push('IndexedDB ' + name);
    return { ok: left.length === 0, left };
  }
  return {
    KEYS, SLOTS, SAVE_KIND, DEFAULTS, PRESETS, IMPORT_MAX_BYTES, init,
    forgetKey, wipeAll,
    settings: () => settings, saveSettings, effectiveTheme, presetOf, applyPreset, requestPersist,
    getApiKey: () => apiKey, setApiKey,
    gameId, envelope, parseEnvelope, shapeProblems, autosave, hasAutosave, loadAutosave, rawAutosave, loadPrevious, peek, inSlot,
    saveSlot, loadSlot, deleteSlot, listSlots, saveNamed, findSlot,
    exportJson, exportSave, exportFileName, downloadAutosave, importFile,
    // Wave 28: a file of text handed to the browser to save (the Debug view's bookkeeper turns).
    download,
    setReadOnly, takeOver, claim, keepAside, holdHand, heldHand, dropHand,
    undoFlush, undoReset, undoResume, undoKept, undoIdle, UNDO_DB, UNDO_STORE,
    // Wave 48: the per-step layout's stores and version, the town kept once in localStorage, and the out-of-room notice.
    UNDO_DB_VERSION, UNDO_HEAD, UNDO_STEPS, UNDO_TOWNS, OUT_OF_ROOM, sweepTowns,
    get tabId() { return tab(); },
    get readOnly() { return readOnly; },
    get failed() { return failed; }
  };
})();

