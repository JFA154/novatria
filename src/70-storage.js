// ===== Module: Storage =====
/* localStorage: settings, one autosave (after every turn: State batches a
   turn's changes; changes outside a turn save at once) and three
   named slots. The API key lives in localStorage only when "Remember on this
   device" is ticked, otherwise in sessionStorage; it is never part of a save
   or an export. Every access is wrapped; a failure shows a visible warning. */
const Storage = (() => {
  const PREFIX = 'novatria.';
  const KEYS = { settings: PREFIX + 'settings', apiKey: PREFIX + 'apiKey', autosave: PREFIX + 'autosave', slot: n => PREFIX + 'slot.' + n };
  const SLOTS = 3;
  const SAVE_KIND = 'novatria-save';
  /* Defaults chosen for the best play-through rather than the cheapest: the
     current Opus writes the story, the current Sonnet turns the player's
     text into an action (the parser sets the difficulty, and with a social
     success binding that is where the doubt lives: a judgement call, so not
     the cheap model), does the bookkeeping, the chronicle and the Upgrade
     calls, and the roles that need judgement think a little harder.
     settingsVersion lets init() upgrade settings saved under earlier
     defaults while keeping anything the player typed in themselves: v1
     (Sonnet narrator, Haiku parser, all effort low), v2 (one "parser
     model", Sonnet, for the parser, bookkeeper, chronicle and Upgrade), v3
     (the field split into parserModel, Haiku, and bookkeeperModel, Sonnet)
     and v4 (the parser back to Sonnet: the owner wants the best
     play-through). A parser model saved at its version's default becomes
     the current default; any other model the player typed is kept (from v1
     and v2, for both roles, since one field drove both). narrationStyle
     (casual or literary) and inputMode (the composer's Do / Say toggle,
     remembered per browser) are newer fields: a settings object without
     them gets the defaults, and the version is not involved. */
  const SETTINGS_VERSION = 4;
  const V1_DEFAULTS = { narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5' };
  const V2_DEFAULTS = { parserModel: 'claude-sonnet-5-5' };
  const V3_DEFAULTS = { parserModel: 'claude-haiku-5-5' };
  const DEFAULTS = {
    settingsVersion: SETTINGS_VERSION,
    narratorModel: 'claude-opus-5-5',
    parserModel: 'claude-sonnet-5-5',
    bookkeeperModel: 'claude-sonnet-5-5',
    effort: { narrator: 'medium', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' },
    showRolls: true,
    permadeath: false,
    theme: null, // null: follow prefers-color-scheme
    textSize: 'M',
    narrationStyle: 'casual',
    inputMode: 'do',
    mockMode: true,
    rememberKey: false,
    panelCollapsed: false
  };
  let settings = deepCopy(DEFAULTS);
  let apiKey = '';
  let failed = false;

  function area(which) { return which === 'session' ? window.sessionStorage : window.localStorage; }
  function fail(msg) { failed = true; UI.warn(msg); }
  function read(key, which) {
    try { return area(which).getItem(key); }
    catch (e) { console.warn('[Storage] read failed', key, e); fail('This browser blocked access to its storage, so saves and settings may not load. You can still export your game from the Saves screen.'); return null; }
  }
  function write(key, value, which) {
    try { area(which).setItem(key, value); return true; }
    catch (e) { console.warn('[Storage] write failed', key, e); fail('Saving failed: this browser\'s storage is full or blocked. Export your game from the Saves screen so nothing is lost.'); return false; }
  }
  function remove(key, which) {
    try { area(which).removeItem(key); return true; }
    catch (e) { console.warn('[Storage] remove failed', key, e); return false; }
  }

  // ----- settings -----
  function cleanSettings(raw) {
    const s = deepCopy(DEFAULTS);
    if (!isObj(raw)) return s;
    const version = typeof raw.settingsVersion === 'number' ? raw.settingsVersion : 1;
    const legacy = version < 2; // v1: the effort and the narrator's old defaults are upgraded too
    const narr = typeof raw.narratorModel === 'string' ? raw.narratorModel.trim() : '';
    const pars = typeof raw.parserModel === 'string' ? raw.parserModel.trim() : '';
    const book = typeof raw.bookkeeperModel === 'string' ? raw.bookkeeperModel.trim() : '';
    if (narr && !(legacy && narr === V1_DEFAULTS.narratorModel)) s.narratorModel = narr;
    if (version >= SETTINGS_VERSION) {
      if (pars) s.parserModel = pars;
      if (book) s.bookkeeperModel = book;
    } else if (version === 3) {
      // v3 put Haiku in front of the parser for a day; a parser left at that default follows Sonnet, anything typed is kept.
      if (pars && pars !== V3_DEFAULTS.parserModel) s.parserModel = pars;
      if (book) s.bookkeeperModel = book;
    } else if (pars && pars !== (legacy ? V1_DEFAULTS : V2_DEFAULTS).parserModel) {
      // One model for every role but the narrator, typed by the player: kept for both.
      s.parserModel = pars;
      s.bookkeeperModel = pars;
    }
    const allLow = isObj(raw.effort) && Object.keys(s.effort).every(k => raw.effort[k] === 'low' || raw.effort[k] === undefined);
    if (isObj(raw.effort) && !(legacy && allLow)) for (const k of Object.keys(s.effort)) if (['low', 'medium', 'high'].includes(raw.effort[k])) s.effort[k] = raw.effort[k];
    for (const k of ['showRolls', 'permadeath', 'mockMode', 'rememberKey', 'panelCollapsed']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (raw.theme === 'dark' || raw.theme === 'parchment') s.theme = raw.theme;
    if (['S', 'M', 'L'].includes(raw.textSize)) s.textSize = raw.textSize;
    if (raw.narrationStyle === 'casual' || raw.narrationStyle === 'literary') s.narrationStyle = raw.narrationStyle;
    if (raw.inputMode === 'do' || raw.inputMode === 'say') s.inputMode = raw.inputMode;
    return s;
  }
  function init() {
    const raw = read(KEYS.settings);
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
    settings = cleanSettings(parsed);
    apiKey = (settings.rememberKey ? read(KEYS.apiKey, 'local') : read(KEYS.apiKey, 'session')) || '';
  }
  function saveSettings(patch) {
    const next = Object.assign({}, settings, patch || {});
    if (patch && patch.effort) next.effort = Object.assign({}, settings.effort, patch.effort);
    settings = cleanSettings(next);
    write(KEYS.settings, JSON.stringify(settings));
    return settings;
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

  // ----- saves -----
  function summaryOf(st) {
    const l = st.locations.find(x => x.id === st.player.locationId);
    return { player: st.player.name, background: st.player.background, day: st.time.day, phase: st.time.phase, location: l ? l.name : '', turn: st.meta.turn, town: st.meta.townName };
  }
  function envelope(name) {
    const st = State.current;
    if (!st) throw new Error('no game in progress');
    return { kind: SAVE_KIND, saveVersion: 1, name: cleanText(name, 40) || `${st.player.name}, day ${st.time.day}`, savedAt: new Date().toISOString(), summary: summaryOf(st), state: deepCopy(st), town: deepCopy(State.town || TOWN_DATA) };
  }
  function serialise(env) {
    let json = JSON.stringify(env);
    // Belt and braces: the key is never in state, but never let it leave either.
    if (apiKey && apiKey.length >= 8 && json.includes(apiKey)) json = json.split(apiKey).join('[redacted]');
    return json;
  }
  function parseEnvelope(text) {
    let env;
    try { env = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!isObj(env)) throw new Error('That file is not a saved game.');
    if (env.kind !== SAVE_KIND && isObj(env.meta) && isObj(env.player)) env = { kind: SAVE_KIND, saveVersion: 1, name: 'Imported', state: env, town: null };
    if (env.kind !== SAVE_KIND || !isObj(env.state)) throw new Error('That file is not a saved game.');
    const errs = State.validateShape(env.state);
    if (errs.length) throw new Error('That save is damaged: ' + errs.join('; '));
    delete env.apiKey;
    delete env.settings;
    if (!isObj(env.town)) env.town = deepCopy(TOWN_DATA);
    return env;
  }
  function autosave() {
    if (!State.current || State.muted) return false;
    return write(KEYS.autosave, serialise(envelope('Autosave')));
  }
  function peek(key) {
    const raw = read(key);
    if (!raw) return null;
    try { return parseEnvelope(raw); } catch (e) { return { broken: true, error: e.message }; }
  }
  function hasAutosave() { const e = peek(KEYS.autosave); return !!(e && !e.broken); }
  function loadAutosave() { const e = peek(KEYS.autosave); return e && !e.broken ? e : null; }
  function saveSlot(n, name) {
    if (!(n >= 1 && n <= SLOTS)) throw new Error('slot must be 1 to ' + SLOTS);
    const env = envelope(name);
    return write(KEYS.slot(n), serialise(env)) ? env : null;
  }
  function loadSlot(n) { const e = peek(KEYS.slot(n)); return e && !e.broken ? e : null; }
  function deleteSlot(n) { return remove(KEYS.slot(n)); }
  function listSlots() {
    const out = [];
    for (let n = 1; n <= SLOTS; n++) out.push(peek(KEYS.slot(n)));
    return out;
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
    return `${slugify(st.meta.townName)}-${slugify(st.player.name)}-day${st.time.day}.json`.replace(/_/g, '-');
  }
  function exportSave() {
    const json = JSON.stringify(JSON.parse(exportJson()), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: exportFileName() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return a.download;
  }
  async function importFile(file) {
    if (!file) throw new Error('No file chosen.');
    const text = await file.text();
    return parseEnvelope(text);
  }
  return {
    KEYS, SLOTS, SAVE_KIND, DEFAULTS, init,
    settings: () => settings, saveSettings, effectiveTheme,
    getApiKey: () => apiKey, setApiKey,
    envelope, parseEnvelope, autosave, hasAutosave, loadAutosave, peek,
    saveSlot, loadSlot, deleteSlot, listSlots, saveNamed, findSlot,
    exportJson, exportSave, exportFileName, importFile,
    get failed() { return failed; }
  };
})();

