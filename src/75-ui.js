// ===== Module: UI =====
/* All rendering. Every dynamic string goes in through el()/textContent. */
const UI = (() => {
  const d = {};
  const TABS = [['character', 'Character'], ['people', 'People'], ['journal', 'Journal'], ['places', 'Places']];
  const mq = window.matchMedia('(max-width: 899px)');
  const isMobile = () => mq.matches;
  let screen = 'title';
  let returnTo = 'title';
  let tab = 'character';
  let debugOn = false;
  let stick = true;
  let busy = false;
  let turnPhase = 'idle'; // the composer's state (setBusy): 'busy', 'closing' or 'idle'
  let toastTimer = null;
  const ac = { items: [], index: -1 };
  const pendingWarnings = [];
  /* The composer's Do / Say toggle. mode persists per browser
     (settings.inputMode). to is who Say mode speaks to; it is never saved,
     and lasts only while the player stays in the same place (sceneLoc) and
     that person is still here. chosen: the player picked it on a chip. */
  const composer = { mode: 'do', to: 'everyone', chosen: false, sceneLoc: null, rendered: '' };
  /* People tab: the id of the one open person card (memory only). */
  let openPerson = null;

  function camel(id) { return id.replace(/-([a-z])/g, (m, c) => c.toUpperCase()); }
  const IDS = ['app', 'banner', 'banner-text', 'banner-close', 'title-name', 'title-setting', 'btn-new', 'btn-continue', 'btn-load',
    'btn-settings', 'btn-theme', 'title-mode', 'create-scroll', 'create-form-view', 'create-summary-view', 'create-steps', 'cr-count',
    'cr-cancel', 'cr-back', 'cr-next', 'cr-review', 'cr-edit', 'cr-begin', 'summary-card', 'tb-time', 'tb-loc', 'tb-hp', 'tb-gold', 'tb-gold-unit',
    'tb-save', 'tb-settings', 'tb-panel', 'tb-menu', 'menu-pop', 'game-body', 'feed-scroll', 'feed', 'new-btn', 'ac', 'cmd', 'send',
    'panel', 'panel-tabs', 'panel-close', 'panel-body', 'settings-form', 'set-key', 'set-remember', 'set-mock', 'set-narrator-model',
    'set-parser-model', 'set-bookkeeper-model', 'set-rolls', 'set-permadeath', 'settings-done', 'settings-quit', 'save-name-field', 'save-name', 'slot-list',
    'btn-export', 'btn-import', 'import-file', 'saves-error', 'saves-done', 'toast', 'say-to', 'mode-do', 'mode-say',
    'btn-update', 'title-update-note', 'set-reread', 'set-reread-none', 'set-reread-behind',
    'narrator-banner', 'narrator-banner-inner', 'narrator-banner-text', 'narrator-banner-actions', 'narrator-banner-go', 'narrator-banner-close'];

  function init() {
    for (const id of IDS) d[camel(id)] = document.getElementById(id);
    d.composer = document.querySelector('.composer');
    d.composer.dataset.turn = turnPhase;
    // Title
    d.btnNew.addEventListener('click', () => App.newGame());
    d.btnContinue.addEventListener('click', () => App.continueGame());
    d.btnUpdate.addEventListener('click', () => App.updateSave('autosave'));
    d.btnLoad.addEventListener('click', () => showScreen('saves'));
    d.btnSettings.addEventListener('click', () => showScreen('settings'));
    d.btnTheme.addEventListener('click', toggleTheme);
    d.bannerClose.addEventListener('click', () => { d.banner.hidden = true; });
    // Who narrates: the game screen's banner (Settings or Turn on the narrator, and x)
    d.narratorBannerGo.addEventListener('click', narratorBannerAction);
    d.narratorBannerClose.addEventListener('click', dismissNarratorBanner);
    d.narratorBanner.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); dismissNarratorBanner(); } });
    // Creation
    Create.wire();
    // Game top bar and menu
    d.tbSave.addEventListener('click', () => showScreen('saves'));
    d.tbSettings.addEventListener('click', () => showScreen('settings'));
    d.tbPanel.addEventListener('click', () => setCollapsed(!d.gameBody.classList.contains('panel-collapsed')));
    d.tbMenu.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
    $$('[data-menu]', d.menuPop).forEach(b => b.addEventListener('click', () => {
      closeMenu();
      const m = b.dataset.menu;
      if (m === 'title') App.quitToTitle(); else showScreen(m);
    }));
    document.addEventListener('click', e => { if (!d.menuPop.hidden && !d.menuPop.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!d.menuPop.hidden) closeMenu();
      else if (mapPick) setPick(null);
      else if (d.gameBody.classList.contains('sheet-open')) closeSheet();
    });
    // Feed
    d.feedScroll.addEventListener('scroll', () => { stick = nearBottom(); if (stick) d.newBtn.hidden = true; }, { passive: true });
    d.newBtn.addEventListener('click', scrollToBottom);
    // Composer
    d.cmd.addEventListener('input', () => { autosize(); updateAc(); syncSendLabel(); });
    syncSendLabel();
    d.cmd.addEventListener('keydown', onKey);
    // Leaving the box closes the command list a moment later; coming straight back keeps it.
    let blurHide = null;
    d.cmd.addEventListener('blur', () => { clearTimeout(blurHide); blurHide = setTimeout(hideAc, 150); });
    d.cmd.addEventListener('focus', () => { clearTimeout(blurHide); blurHide = null; });
    d.send.addEventListener('click', () => send());
    composer.mode = Storage.settings().inputMode === 'say' ? 'say' : 'do';
    d.modeDo.addEventListener('click', () => { setMode('do'); focusInput(); });
    d.modeSay.addEventListener('click', () => { setMode('say'); focusInput(); });
    d.sayTo.addEventListener('click', e => {
      const b = e.target.closest('[data-to]');
      if (b && setAddressee(b.dataset.to)) focusInput();
    });
    $$('[data-open-tab]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.openTab)));
    // Panel / sheet
    d.panelClose.addEventListener('click', closeSheet);
    wireSwipe();
    mq.addEventListener('change', () => { if (!isMobile()) closeSheet(); Create.layoutChanged(); renderComposer(); fitNarratorBanner(); });
    // Settings and saves
    d.settingsForm.addEventListener('change', onSettingsChange);
    d.settingsForm.addEventListener('input', e => { if (e.target === d.setKey) onSettingsChange(e); });
    d.settingsForm.addEventListener('submit', e => e.preventDefault());
    d.settingsDone.addEventListener('click', back);
    d.setReread.addEventListener('click', () => App.updateGame());
    d.settingsQuit.addEventListener('click', () => App.quitToTitle());
    d.savesDone.addEventListener('click', back);
    d.btnExport.addEventListener('click', () => { try { Storage.exportSave(); toast('Exported.'); } catch (e) { d.savesError.textContent = e.message; } });
    d.btnImport.addEventListener('click', () => d.importFile.click());
    d.importFile.addEventListener('change', onImport);
    try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyDisplay); } catch (e) { /* old browsers */ }
    initViewport();
    applyDisplay();
    setCollapsed(Storage.settings().panelCollapsed, true);
    renderComposer();
    while (pendingWarnings.length) warn(pendingWarnings.shift());
  }

  // ----- viewport (mobile keyboard) -----
  function initViewport() {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      if (!vv) return;
      root.style.setProperty('--app-h', Math.round(vv.height) + 'px');
      d.app.style.transform = vv.offsetTop > 0 ? `translateY(${Math.round(vv.offsetTop)}px)` : '';
      if (stick && screen === 'game') scrollToBottom();
    };
    if (vv) { vv.addEventListener('resize', update); vv.addEventListener('scroll', update); }
    window.addEventListener('resize', update); // also on window resize, for a browser that skips the visualViewport event
    update();
  }

  // ----- display settings -----
  function applyDisplay() {
    const s = Storage.settings();
    const theme = Storage.effectiveTheme();
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-size', s.textSize);
    d.btnTheme.textContent = theme === 'dark' ? 'Parchment theme' : 'Dark theme';
  }
  function toggleTheme() {
    Storage.saveSettings({ theme: Storage.effectiveTheme() === 'dark' ? 'parchment' : 'dark' });
    applyDisplay();
  }

  // ----- warnings and toasts -----
  function warn(msg) {
    if (!d.banner) { pendingWarnings.push(msg); return; }
    d.bannerText.textContent = msg;
    d.banner.hidden = false;
  }
  function toast(msg) {
    d.toast.textContent = msg;
    d.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => d.toast.classList.remove('show'), 2600);
  }

  // ----- screens -----
  function showScreen(name) {
    if ((name === 'settings' || name === 'saves') && screen !== 'settings' && screen !== 'saves') returnTo = screen;
    for (const sc of $$('.screen')) sc.classList.toggle('active', sc.id === 'screen-' + name);
    screen = name;
    closeMenu();
    closeSheet();
    if (name === 'title') renderTitle();
    else if (name === 'settings') fillSettings();
    else if (name === 'saves') renderSaves();
    else if (name === 'game') { renderNarratorBanner(); renderGame(); scrollToBottom(); if (!isMobile()) d.cmd.focus({ preventScroll: true }); }
  }
  function back() {
    if (returnTo === 'game' && !App.inGame()) returnTo = 'title';
    showScreen(returnTo || 'title');
  }
  function renderTitle() {
    const t = TOWN_DATA;
    d.titleName.textContent = t.name;
    d.titleSetting.textContent = t.setting;
    document.title = t.name;
    d.btnNew.disabled = busy;
    d.btnLoad.disabled = busy;
    // An autosave under older rules: Continue plays it as it is; Update brings it up to date first.
    const auto = Storage.loadAutosave();
    const behind = !!auto && Upgrade.behind(auto.state);
    d.btnContinue.disabled = busy || !auto;
    d.btnUpdate.hidden = !behind;
    d.btnUpdate.disabled = busy;
    d.titleUpdateNote.hidden = !behind;
    const note = NARRATOR_NOTES[narratorState()];
    d.titleMode.textContent = note ? note.title : '';
    d.titleMode.hidden = !note;
  }

  // ----- who narrates (the first impression) -----
  /* Mock mode is on by default, so someone who never read the README plays
     with the placeholder narrator and needs telling plainly how to get the
     real one. 'offline': mock mode with no key; 'mock': mock mode
     with a key stored; 'nokey': mock mode off and no key, so every turn
     would fail (a key kept only for the session is gone next time, while
     the mock setting stays off); null: Claude narrates. */
  const NARRATOR_NOTES = {
    offline: {
      banner: 'Offline: the story is placeholder text. Add an API key in Settings for the real narrator.',
      go: 'Settings',
      title: 'No API key yet: the game plays offline with placeholder narration. Add one in Settings.'
    },
    mock: {
      banner: 'Mock mode is on: the story is placeholder text and your key is not used.',
      go: 'Turn on the narrator',
      title: 'Mock mode is on: placeholder narration, no API calls. Turn it off in Settings.'
    },
    nokey: {
      banner: 'No API key: mock mode is off, so turns will fail. Add a key in Settings.',
      go: 'Settings',
      title: 'No API key yet, and mock mode is off, so turns will fail. Add a key in Settings, or turn mock mode back on.'
    }
  };
  function narratorState() {
    const key = !!Storage.getApiKey();
    if (Api.providerName() === 'mock') return key ? 'mock' : 'offline';
    return key ? null : 'nokey';
  }
  /* The banner kinds dismissed with x, for the rest of this browser session
     (sessionStorage, so it is back the next time the game is opened). Kept
     per kind: hiding "offline" does not hide "turns will fail". Blocked
     storage keeps the choice for this page only; that is not worth a
     warning. */
  const BANNER_DISMISSED_KEY = 'novatria.narratorBannerDismissed';
  let bannerDismissed = null;
  function dismissedKinds() {
    if (bannerDismissed) return bannerDismissed;
    let raw = '';
    try { raw = window.sessionStorage.getItem(BANNER_DISMISSED_KEY) || ''; } catch (e) { raw = ''; }
    bannerDismissed = new Set(raw.split(',').filter(k => Object.prototype.hasOwnProperty.call(NARRATOR_NOTES, k)));
    return bannerDismissed;
  }
  function renderNarratorBanner() {
    const kind = narratorState();
    const note = kind && !dismissedKinds().has(kind) ? NARRATOR_NOTES[kind] : null;
    d.narratorBanner.hidden = !note;
    d.narratorBanner.dataset.kind = note ? kind : '';
    if (!note) return;
    // The words up to the colon lead in bold. Only a change is written, so the live region speaks once.
    if (d.narratorBannerText.textContent !== note.banner) {
      const i = note.banner.indexOf(': ') + 1;
      d.narratorBannerText.replaceChildren(el('b', null, note.banner.slice(0, i)), note.banner.slice(i));
    }
    d.narratorBannerGo.textContent = note.go;
    d.narratorBannerGo.disabled = busy && kind === 'mock';
    fitNarratorBanner();
  }
  /* Phones: the text runs round the buttons, so its float is as wide as
     they are (only measurable while the banner shows). */
  function fitNarratorBanner() {
    const w = d.narratorBanner.hidden ? 0 : d.narratorBannerActions.offsetWidth;
    if (w) d.narratorBannerInner.style.setProperty('--nb-actions', w + 'px');
  }
  function dismissNarratorBanner() {
    const kind = d.narratorBanner.dataset.kind;
    if (!kind) return;
    const set = dismissedKinds();
    set.add(kind);
    try { window.sessionStorage.setItem(BANNER_DISMISSED_KEY, [...set].join(',')); } catch (e) { /* kept for this page */ }
    const had = d.narratorBanner.contains(document.activeElement);
    renderNarratorBanner();
    if (had) focusInput();
  }
  /* Settings opens with the key field focused (on a phone the keyboard
     comes up, ready to paste); "Turn on the narrator" unticks mock mode, so
     the next turn goes to Claude with the stored key. */
  function narratorBannerAction() {
    const kind = d.narratorBanner.dataset.kind;
    if (kind === 'mock') {
      if (busy) return;
      Storage.saveSettings({ mockMode: false });
      renderNarratorBanner();
      toast('Mock mode is off: Claude narrates your next turn.');
      focusInput();
      return;
    }
    openKeySettings();
  }
  function openKeySettings() {
    showScreen('settings');
    d.setKey.focus();
  }

  // ----- top bar, menu, panel -----
  function renderGame() {
    const s = State.current;
    if (!s) return;
    const l = State.loc(s.player.locationId);
    d.tbTime.textContent = `Day ${s.time.day} · ${capFirst(s.time.phase)}`;
    d.tbLoc.textContent = l ? l.name : '';
    d.tbHp.textContent = `${s.player.hp}/${s.player.maxHp}`;
    const cash = currency();
    d.tbGold.textContent = cash ? money(s.player.gold) : String(s.player.gold);
    d.tbGoldUnit.textContent = cash ? '' : ' gold';
    renderPanel();
    renderComposer();
  }
  function toggleMenu() { if (d.menuPop.hidden) { d.menuPop.hidden = false; d.tbMenu.setAttribute('aria-expanded', 'true'); } else closeMenu(); }
  function closeMenu() { if (d.menuPop) { d.menuPop.hidden = true; d.tbMenu.setAttribute('aria-expanded', 'false'); } }
  function setCollapsed(c, silent) {
    d.gameBody.classList.toggle('panel-collapsed', !!c);
    d.tbPanel.setAttribute('aria-pressed', String(!c));
    if (!silent) Storage.saveSettings({ panelCollapsed: !!c });
  }
  function openSheet() { d.gameBody.classList.add('sheet-open'); d.panelClose.focus({ preventScroll: true }); }
  function closeSheet() {
    if (!d.gameBody) return;
    d.gameBody.classList.remove('sheet-open');
    d.panel.style.transform = '';
    d.panel.style.transition = '';
  }
  function openPanel(id) {
    if (id === 'debug' && !debugOn) return;
    tab = id;
    renderPanel();
    if (isMobile()) openSheet(); else setCollapsed(false);
  }
  function wireSwipe() {
    let drag = null;
    d.panel.addEventListener('touchstart', e => {
      if (!isMobile() || !d.gameBody.classList.contains('sheet-open') || e.touches.length !== 1) return;
      if (d.panelBody.contains(e.target) && d.panelBody.scrollTop > 0) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return; // the editor's slider and fields
      drag = { y: e.touches[0].clientY, dy: 0 };
    }, { passive: true });
    d.panel.addEventListener('touchmove', e => {
      if (!drag) return;
      drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
      d.panel.style.transition = 'none';
      d.panel.style.transform = `translateY(${drag.dy}px)`;
    }, { passive: true });
    const end = () => {
      if (!drag) return;
      const dy = drag.dy;
      drag = null;
      d.panel.style.transition = '';
      d.panel.style.transform = '';
      if (dy > 90) closeSheet();
    };
    d.panel.addEventListener('touchend', end);
    d.panel.addEventListener('touchcancel', end);
  }
  function toggleDebug(force) {
    debugOn = typeof force === 'boolean' ? force : !debugOn;
    if (debugOn) tab = 'debug';
    else if (tab === 'debug') tab = 'character';
    renderPanel();
    return debugOn;
  }
  function renderTabs() {
    const tabs = TABS.concat(debugOn ? [['debug', 'Debug']] : []);
    if (!tabs.some(t => t[0] === tab)) tab = 'character';
    d.panelTabs.replaceChildren(...tabs.map(([id, label]) => el('button', {
      type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': String(id === tab), 'aria-controls': 'panel-body',
      dataset: { tab: id }, onclick: () => { tab = id; renderPanel(); }
    }, label)));
  }
  function renderPanel() {
    renderTabs();
    const s = State.current;
    // An open editor keeps what is typed, the focused field and the scroll through a re-render.
    const form = editing ? $('.pedit', d.panelBody) : null;
    const focusId = form && form.contains(document.activeElement) ? document.activeElement.id : null;
    const scroll = form ? d.panelBody.scrollTop : null;
    if (form && form.dataset.npc === editing.id) editing.draft = readForm(form);
    if (editing && (!s || State.muted || !State.npc(editing.id))) editing = null;
    d.panelBody.replaceChildren();
    d.panelBody.dataset.tab = tab;
    d.panelBody.setAttribute('aria-labelledby', 'tab-' + tab);
    if (tab !== 'places') mapPick = null;
    if (!s || State.muted) return;
    appendKids(d.panelBody, (PANELS[tab] || PANELS.character)(s));
    if (tab === 'places') placeChip($('.map', d.panelBody));
    if (scroll !== null && $('.pedit', d.panelBody)) d.panelBody.scrollTop = scroll;
    const again = focusId && document.getElementById(focusId);
    if (again) again.focus({ preventScroll: true });
  }
  function list(items, fmt, empty) { return items.length ? el('ul', null, items.map(x => el('li', null, fmt(x)))) : el('p', { class: 'empty' }, empty); }

  // ----- People: person cards -----
  /* Someone the player has met: introduced (knownToPlayer), or dealt with
     without learning their name (they remember the player, told them a
     rumour, or were spoken to in Say mode). Strangers show as npcLabel. */
  function hasMet(s, n) {
    if (n.knownToPlayer) return true;
    return n.memories.length > 0
      || s.rumours.some(r => r.heard && r.heardFrom === n.id)
      || s.log.some(e => e.to === n.id);
  }
  /* Someone the story named (State peopleRevealed) whom the player has
     only heard of: listed by name under Heard of until they meet. Someone
     known only by who they are to someone ("Dewayne's wife") is not listed
     until they have a name or the player meets them. */
  function heardOfOnly(s, n) { return isObj(n.created) && n.created.by === 'story' && !n.unnamed && n.alive !== false && !hasMet(s, n); }
  const PERSON_HUES = 6;
  /* A colour from the id (a string hash), so a person keeps theirs all game. */
  function personHue(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
    return (h % PERSON_HUES) + 1;
  }
  const NOT_INITIALS = /^(the|a|an|and|of|at|in|on|for|from|with|to|jr|sr|ii|iii|iv)$/i;
  function initials(text) {
    const words = String(text || '').split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(w => w && !NOT_INITIALS.test(w));
    if (!words.length) return '?';
    const pick = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
    return pick.map(w => w.charAt(0).toUpperCase()).join('');
  }
  /* Five-segment attitude meter: segments filled per State.attitudeWord, and
     the tone (cold to warm) the meter and the word are drawn in. */
  const ATTITUDE_LEVEL = { hostile: 1, cold: 1, wary: 2, neutral: 3, friendly: 4, warm: 5, loyal: 5 };
  function attitudeMeter(word) {
    const level = ATTITUDE_LEVEL[word] || 3;
    const segs = [];
    for (let i = 1; i <= 5; i++) segs.push(el('i', { class: i <= level ? 'on' : null }));
    return el('span', { class: 'att', dataset: { att: word, level: String(level) } },
      el('span', { class: 'att-meter', 'aria-hidden': 'true' }, segs), el('span', { class: 'att-word' }, word));
  }
  function whereLine(s, n, isHere) {
    if (isHere) return el('span', { class: 'pcard-where here' }, 'Here now');
    const v = (s.seen || {})[n.id];
    const l = v && State.loc(v.locationId);
    return l ? el('span', { class: 'pcard-where' }, `Last seen: ${l.name}, `, el('span', { class: 'nowrap' }, `day ${v.day} ${v.phase}`)) : null;
  }
  function reEsc(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* A memory in the player's words: "Tester insulted them" -> "you insulted
     them". A story-point fact keeps its own label. */
  function plainMemory(s, text) {
    let t = String(text || '').trim().replace(/\.$/, '');
    let key = 'Remembers';
    const fact = /^Fact \(a story point\):\s*/i.exec(t);
    if (fact) { key = 'Fact'; t = t.slice(fact[0].length); }
    const verb = { is: 'are', was: 'were', has: 'have' };
    // The player's name as written (case-sensitive, so "Will" leaves "will" alone), or "the player".
    const toYou = (who, flags) => {
      const re = x => new RegExp(`(?<![\\p{L}\\p{N}])${who}${x}(?![\\p{L}\\p{N}])`, flags);
      t = t.replace(re("['\u2019]s"), 'your').replace(re(' (is|was|has)'), (m, v) => 'you ' + verb[v.toLowerCase()]).replace(re(''), 'you');
    };
    if (s.player.name) toYou(reEsc(s.player.name), 'gu');
    toYou('(?:the player|^player)', 'giu');
    // Lower-case the first word unless it is a name the town uses.
    const first = (/^[\p{L}']+/u.exec(t) || [''])[0];
    const proper = s.npcs.some(n => n.name.split(/\s+/).includes(first)) || s.locations.some(l => l.name.split(/\s+/).includes(first));
    return [key, proper ? t : lowerFirst(t)];
  }
  /* Notes for an open card, newest first within each kind: what they told
     the player, what they remember (weight 2+ or the last 20 turns), known
     threads they are part of, and the loose end that ties them to the player. */
  function personNotes(s, n) {
    const notes = [];
    for (const r of s.rumours) if (r.heard && (r.heardFrom || r.sourceNpcId) === n.id) notes.push(['Told you', r.text]);
    const dayOf = turn => { for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i].turn === turn) return s.log[i].day; return turn === 0 ? 1 : null; };
    const mems = Pipeline.pickMemories(n.memories, s.meta.turn, { w3: 4, w2: 3, w1: 1, recent: 10, cap: 8 }).reverse();
    for (const m of mems) {
      const [k, t] = plainMemory(s, m.text);
      const day = dayOf(m.turn);
      notes.push([k, day ? `${t}, day ${day}` : t]);
    }
    const loose = (s.player.looseEnds || []).filter(x => x.npcId === n.id);
    const looseThreads = loose.map(x => x.threadId);
    for (const t of s.threads) {
      if (!t.knownToPlayer || !t.linkedIds.includes(n.id) || looseThreads.includes(t.id)) continue;
      notes.push([t.title + (t.status !== 'open' ? ` (${t.status})` : ''), t.summary]);
    }
    for (const x of loose) notes.push([x.label, x.text]);
    return notes;
  }
  /* What the town knows about someone, for an open card: where they live
     (a home the player knows of, or where someone away lives and how to
     reach them), where the dead are buried, their people ("wife Mavis
     Mangum; boss Royce Pittman", the dead and the far away marked) and,
     once the player knows who they are, their history. Never a home the
     player has not found, a goal or a secret. */
  function personFacts(s, n, known) {
    const rows = [];
    const pres = presenceOf(n);
    const home = n.home && n.home.locationId ? State.loc(n.home.locationId) : null;
    if (pres === 'away' && n.where) rows.push(['Lives', n.where]);
    else if (pres !== 'dead' && home && (home.discovered || home.away === true)) rows.push(['Home', home.name]);
    if (pres === 'away' && n.reach && known) rows.push(['Reach', n.reach]);
    const grave = pres === 'dead' && n.buried ? State.loc(n.buried) : null;
    if (grave) rows.push(['Buried', grave.name]);
    const ties = State.tiesOf(n).has.map(x => { const m = State.npc(x.id); const pm = presenceOf(m); return `${x.relation || 'related to'} ${m.name}${pm === 'dead' ? ' (dead)' : pm === 'away' ? ' (lives elsewhere)' : ''}`; });
    if (ties.length) rows.push(['Ties', ties.join('; ')]);
    if (known && typeof n.history === 'string' && n.history) rows.push(['History', n.history]);
    return rows.length ? el('dl', { class: 'kv pcard-facts' }, rows.map(([k, v]) => [el('dt', null, k), el('dd', { dataset: { fact: k.toLowerCase() } }, v)])) : null;
  }
  /* The line under the name of someone who is not in town. */
  function absentLine(n) {
    if (presenceOf(n) === 'dead') return n.died ? `Died ${n.died}` : 'Dead';
    return n.where ? `Lives elsewhere: ${n.where}` : 'Gone from town';
  }
  function personCard(s, n, isHere) {
    const heard = heardOfOnly(s, n);
    const known = !!n.knownToPlayer || heard;
    const name = heard ? n.name : npcLabel(n);
    const open = openPerson === n.id;
    const status = n.alive === false ? 'dead' : (n.status && n.status !== 'free' ? n.status : '');
    const absent = presenceOf(n) !== 'here';
    const moreId = 'pmore-' + n.id;
    const notes = personNotes(s, n);
    const facts = personFacts(s, n, known);
    const edit = !!editing && editing.id === n.id;
    const age = ageText(n.age);
    // Someone not in town says so under their name instead (Died ..., Lives elsewhere: ...).
    const roleLine = [capFirst(n.role || ''), State.relationNote(n), absent ? '' : status].filter(Boolean).join(' · ');
    return el('article', { class: 'pcard' + (known ? '' : ' stranger') + (open ? ' open' : '') + (edit ? ' editing' : ''), dataset: { npc: n.id, status: status || 'free' } },
      el('button', { type: 'button', class: 'pcard-head', id: 'phead-' + n.id, 'aria-expanded': String(open), 'aria-controls': moreId, onclick: () => togglePerson(n.id) },
        el('span', { class: 'mono', dataset: { hue: String(personHue(n.id)) }, 'aria-hidden': 'true' }, initials(name)),
        el('span', { class: 'pcard-main' },
          el('span', { class: 'pcard-nameline' }, el('span', { class: 'pcard-name' }, name),
            age ? el('span', { class: 'pcard-age', title: 'Age' }, `· ${age}`) : null,
            el('span', { class: 'pcard-pron', title: 'Pronouns' }, pronounLabel(n.pronouns))),
          roleLine ? el('span', { class: 'pcard-role' }, roleLine) : null,
          el('span', { class: 'pcard-meta' }, absent ? el('span', { class: 'pcard-where away' }, absentLine(n)) : heard ? el('span', { class: 'pcard-where' }, 'Heard of, not met') : [attitudeMeter(State.attitudeWord(n.attitude)), whereLine(s, n, isHere)])),
        el('span', { class: 'pcard-chev', 'aria-hidden': 'true' })),
      el('div', { class: 'pcard-more', id: moreId, hidden: !open }, edit ? editForm(s, n) : [
        n.look ? el('p', { class: 'pcard-look' }, n.look) : null,
        facts,
        notes.length ? [el('h4', { class: 'pcard-notes-h' }, 'Notes'),
          el('ul', { class: 'pcard-notes' }, notes.map(([k, t]) => el('li', null, el('span', { class: 'note-k' }, k + ': '), t)))] : null,
        !n.look && !notes.length && !facts ? el('p', { class: 'pcard-none' }, 'Nothing more yet.') : null,
        el('div', { class: 'pcard-fix' }, el('span', { class: 'pcard-fix-k' }, 'Pronouns'),
          el('span', { class: 'chips pcard-chips', role: 'group', 'aria-label': `Pronouns for ${name}` }, PRONOUNS.map(p => el('button', { type: 'button', class: 'chip pcard-pchip', 'aria-pressed': String(n.pronouns === p), dataset: { pron: p }, onclick: () => App.setPronouns(n.id, p) }, pronounLabel(p)))),
          el('button', { type: 'button', class: 'btn small pcard-edit', id: 'pedit-btn-' + n.id, 'aria-label': `Edit ${name}`, disabled: Pipeline.busy, title: Pipeline.busy ? App.BUSY_NOTICE : null, onclick: () => startEdit(n.id) }, 'Edit'))]));
  }
  /* Open one card (or close it). In memory only, never saved; a re-render
     keeps the open card open. Game.UI.togglePerson(id, open?). */
  function togglePerson(id, want) {
    const on = typeof want === 'boolean' ? want : openPerson !== id;
    if (on) openPerson = id;
    else if (openPerson === id) openPerson = null;
    for (const card of $$('.pcard', d.panelBody)) {
      const isOpen = card.dataset.npc === openPerson;
      const more = $('.pcard-more', card);
      card.classList.toggle('open', isOpen);
      $('.pcard-head', card).setAttribute('aria-expanded', String(isOpen));
      more.classList.toggle('fade', isOpen && card.dataset.npc === id);
      more.hidden = !isOpen;
    }
    return openPerson;
  }
  // ----- People: a card's editor -----
  /* Edit (on any open card) swaps the card's body for a form with the whole
     record: name, pronouns, role, look, voice, personality, attitude, who
     they are to whom, home, status, memories, and (folded away) the goal
     and secret the game keeps hidden. Save sends what the player changed
     to App.editPerson (one editPerson through the engine, one /undo step);
     a refusal keeps the form open with the reason; Cancel or Escape puts
     the card back. Enter in a one-line field never saves. One editor at a
     time, in memory only (editing): whose it is (id), the values it opened
     with (base: only what differs from them is sent, so a turn that lands
     while it is open is not undone), what is typed (draft, kept through any
     re-render) and the engine's last refusal (error). */
  let editing = null;
  const WEIGHTS = [[1, '1 small'], [2, '2 notable'], [3, '3 serious']];
  const EDIT_STATUSES = [['free', 'Free'], ['arrested', 'Arrested'], ['gone', 'Gone'], ['dead', 'Dead']];
  function hasCard(s, n) { return hasMet(s, n) || heardOfOnly(s, n); }
  function editBase(n) {
    const c = isObj(n.created) ? n.created : {};
    const traits = (n.personality || []).slice(0, 3);
    while (traits.length < 3) traits.push('');
    return {
      name: n.name, age: Number.isInteger(n.age) ? String(n.age) : '', pronouns: validPronouns(n.pronouns) || 'they', role: n.role || '', look: n.look || '', voice: n.voice || '', history: typeof n.history === 'string' ? n.history : '', traits,
      attitude: n.attitude | 0, relTo: c.relationToNpcId || '', relation: c.relationToNpcId ? c.relation || '' : '',
      home: n.home && n.home.locationId ? n.home.locationId : '', status: n.alive === false ? 'dead' : (n.status || 'free'),
      memories: (n.memories || []).map(m => ({ turn: m.turn, text: m.text, weight: m.weight, model: m.model === true })),
      goal: n.goal || '', secret: n.secret || '', hiddenOpen: false
    };
  }
  function editForm(s, n) {
    const v = editing.draft || editing.base;
    const id = n.id;
    const max = State.EDIT_MAX;
    const fid = k => `pe-${k}-${id}`;
    const field = (k, label, control, hint) => el('div', { class: 'field' }, el('label', { class: 'label', for: fid(k) }, label), control, hint ? el('p', { class: 'hint' }, hint) : null);
    const input = (k, value, len, extra) => el('input', Object.assign({ class: 'input', id: fid(k), name: k, type: 'text', value, maxlength: String(len), autocomplete: 'off' }, extra || {}));
    // A text box tall enough for what is in it (about 30 characters a line on a phone), from rows up to 6 lines.
    const area = (k, value, len, rows) => el('textarea', { class: 'input', id: fid(k), name: k, rows: String(clamp(Math.ceil(String(value || '').length / 30), rows, 6)), maxlength: String(len), value });
    const select = (k, value, options, extra) => {
      const node = el('select', Object.assign({ class: 'input', id: fid(k), name: k }, extra || {}), options.map(([val, label]) => el('option', { value: val }, label)));
      node.value = value;
      return node;
    };
    const others = s.npcs.filter(m => m.id !== id && (m.alive !== false || m.id === v.relTo)).slice().sort((a, b) => a.name.localeCompare(b.name));
    const places = s.locations.filter(l => l.discovered || l.id === v.home).slice().sort((a, b) => a.name.localeCompare(b.name));
    const word = a => `${a > 0 ? '+' : ''}${a} · ${State.attitudeWord(a)}`;
    const attOut = el('output', { class: 'pedit-att-word', id: fid('attitude-word'), for: fid('attitude') }, word(v.attitude));
    const range = el('input', { class: 'pedit-range', id: fid('attitude'), name: 'attitude', type: 'range', min: '-100', max: '100', step: '1', value: String(v.attitude), 'aria-valuetext': word(v.attitude),
      oninput: e => { const a = parseInt(e.target.value, 10) || 0; attOut.textContent = word(a); e.target.setAttribute('aria-valuetext', word(a)); } });
    const relation = input('relation', v.relation, max.relation, { placeholder: 'wife, brother, boss', disabled: !v.relTo });
    const relTo = select('relTo', v.relTo, [['', 'Nobody']].concat(others.map(m => [m.id, m.name + (m.alive === false ? ' (dead)' : '')])),
      { onchange: e => { relation.disabled = !e.target.value; } });
    const mems = v.memories.map((m, i) => el('div', { class: 'pedit-mem', dataset: { i: String(i) } },
      el('label', { class: 'visually-hidden', for: fid('mem-' + i) }, `Memory ${i + 1}`),
      el('textarea', { class: 'input', id: fid('mem-' + i), rows: '2', maxlength: String(max.memory), value: m.text, dataset: { mem: 'text' }, placeholder: 'What they remember about you' }),
      el('label', { class: 'visually-hidden', for: fid('memw-' + i) }, `How much memory ${i + 1} matters`),
      (() => { const w = el('select', { class: 'input', id: fid('memw-' + i), dataset: { mem: 'weight' } }, WEIGHTS.map(([val, label]) => el('option', { value: String(val) }, label))); w.value = String(m.weight); return w; })(),
      el('button', { type: 'button', class: 'btn small pedit-mem-del', 'aria-label': `Remove memory ${i + 1}`, onclick: () => editMemories(list => list.splice(i, 1), i) }, 'Remove')));
    const full = v.memories.length >= State.MEMORY_MAX;
    return el('form', { class: 'pedit', dataset: { npc: id }, 'aria-label': `Edit ${n.name}`, novalidate: true, onsubmit: e => e.preventDefault(), onkeydown: editKey },
      field('name', 'Name', input('name', v.name, max.name)),
      field('age', 'Age', el('input', { class: 'input pedit-age', id: fid('age'), name: 'age', type: 'number', inputmode: 'numeric', min: '0', max: String(max.age), step: '1', value: v.age, autocomplete: 'off' }), presenceOf(n) === 'dead' ? 'Their age when they died.' : `A whole number, 0 to ${max.age}.`),
      field('pronouns', 'Pronouns', select('pronouns', v.pronouns, PRONOUNS.map(p => [p, pronounLabel(p)]))),
      field('role', 'Role', input('role', v.role, max.role), 'Who they are or what they do, in a line.'),
      field('look', 'Look', area('look', v.look, max.look, 3)),
      field('voice', 'Voice', area('voice', v.voice, max.voice, 2)),
      field('history', 'History', area('history', v.history, max.history, 3), 'Where they come from and what happened to them: what the town knows.'),
      el('div', { class: 'field' }, el('span', { class: 'label', id: fid('traits') }, 'Personality'),
        el('div', { class: 'pedit-traits', role: 'group', 'aria-labelledby': fid('traits') }, [0, 1, 2].map(i => input('trait' + i, v.traits[i] || '', max.trait, { 'aria-label': `Trait ${i + 1}`, placeholder: ['stubborn', 'kind', 'nosy'][i] })))),
      el('div', { class: 'field' }, el('label', { class: 'label', for: fid('attitude') }, 'Attitude to you'), el('div', { class: 'pedit-att' }, range, attOut)),
      field('relTo', 'Related to', relTo),
      field('relation', 'Relation', relation, 'What they are to that person.'),
      field('home', 'Home', select('home', v.home, [['', 'Nowhere / off-screen']].concat(places.map(l => [l.id, l.name]))), 'Where they are whenever nothing else has them.'),
      el('fieldset', { class: 'field pedit-status' }, el('legend', { class: 'label' }, 'Status'),
        el('div', { class: 'seg' }, EDIT_STATUSES.map(([val, label]) => el('label', null, el('input', { type: 'radio', name: 'status', value: val, checked: v.status === val, dataset: { status: val } }), label)))),
      el('fieldset', { class: 'field pedit-mems' }, el('legend', { class: 'label' }, 'Memories'),
        mems.length ? mems : el('p', { class: 'empty' }, 'They remember nothing about you.'),
        el('button', { type: 'button', class: 'btn small pedit-add', disabled: full, title: full ? `At most ${State.MEMORY_MAX} memories` : null,
          onclick: () => editMemories(list => list.push({ turn: State.current.meta.turn, text: '', weight: 2, model: false }), v.memories.length) }, 'Add a memory')),
      el('details', { class: 'pedit-hidden', open: v.hiddenOpen === true },
        el('summary', null, 'Hidden from you: goal and secret'),
        el('p', { class: 'hint' }, "These are the game's secrets about this person. Reading them spoils the story."),
        field('goal', 'Goal', area('goal', v.goal, max.goal, 2)),
        field('secret', 'Secret', area('secret', v.secret, max.secret, 3))),
      el('p', { class: 'err', role: 'alert' }, editing.error || ''),
      el('div', { class: 'pedit-actions' },
        el('button', { type: 'button', class: 'btn primary pedit-save', disabled: Pipeline.busy, title: Pipeline.busy ? App.BUSY_NOTICE : null, onclick: () => saveEdit() }, 'Save'),
        el('button', { type: 'button', class: 'btn pedit-cancel', onclick: () => cancelEdit() }, 'Cancel')));
  }
  /* What is typed in an editor form. */
  function readForm(form) {
    const val = k => { const x = form.querySelector(`[name="${k}"]`); return x ? x.value : ''; };
    const was = (editing.draft || editing.base).memories;
    const st = form.querySelector('input[name="status"]:checked');
    const hidden = $('.pedit-hidden', form);
    return {
      name: val('name'), age: val('age'), pronouns: val('pronouns'), role: val('role'), look: val('look'), voice: val('voice'), history: val('history'),
      traits: [0, 1, 2].map(i => val('trait' + i)), attitude: parseInt(val('attitude'), 10) || 0,
      relTo: val('relTo'), relation: val('relation'), home: val('home'), status: st ? st.value : editing.base.status,
      memories: $$('.pedit-mem', form).map(row => {
        const m = was[+row.dataset.i] || {};
        return { turn: m.turn, model: m.model === true, text: $('[data-mem="text"]', row).value, weight: parseInt($('[data-mem="weight"]', row).value, 10) || 1 };
      }),
      goal: val('goal'), secret: val('secret'), hiddenOpen: !!(hidden && hidden.open)
    };
  }
  /* The editPerson fields for what differs from what the form opened with. */
  function editChanges(base, v) {
    const out = {};
    for (const k of ['name', 'pronouns', 'role', 'look', 'voice', 'history', 'goal', 'secret']) if (v[k] !== base[k]) out[k] = v[k];
    // An age as typed (the engine checks it: a whole number 0 to 120); cleared, it is null.
    if (String(v.age || '').trim() !== String(base.age || '').trim()) out.age = String(v.age || '').trim() === '' ? null : String(v.age).trim();
    const traits = list => list.map(t => String(t || '').trim()).filter(Boolean);
    if (JSON.stringify(traits(v.traits)) !== JSON.stringify(traits(base.traits))) out.personality = traits(v.traits);
    if (v.attitude !== base.attitude) out.attitude = v.attitude;
    if (v.relTo !== base.relTo) out.relationToNpcId = v.relTo || null;
    if (v.relTo && v.relation !== base.relation) out.relation = v.relation;
    if (v.home !== base.home) out.homeLocationId = v.home || null;
    if (v.status !== base.status) out.status = v.status;
    // A memory left empty (a new one never written, or one cleared) is dropped.
    const mems = list => list.filter(m => String(m.text || '').trim()).map(m => Object.assign({ turn: m.turn, text: m.text, weight: m.weight }, m.model ? { model: true } : {}));
    const key = list => JSON.stringify(list.map(m => [m.turn, String(m.text).trim(), m.weight]));
    if (key(mems(v.memories)) !== key(mems(base.memories))) out.memories = mems(v.memories);
    return out;
  }
  function editKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); return; }
    // Enter in a one-line field does nothing: only the Save button saves.
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
  }
  /* Add or remove a memory line: the form is drawn again from what is typed. */
  function editMemories(change, focusAt) {
    const form = editing && $('.pedit', d.panelBody);
    if (!form) return;
    editing.draft = readForm(form);
    change(editing.draft.memories);
    const n = State.npc(editing.id);
    const fresh = editForm(State.current, n);
    form.replaceWith(fresh);
    const rows = $$('.pedit-mem', fresh);
    const target = rows[Math.min(focusAt, rows.length - 1)];
    const f = target ? $('[data-mem="text"]', target) : $('.pedit-add', fresh);
    if (f) f.focus();
  }
  /* Open someone's card in edit mode (the card's Edit button; /edit via
     UI.editPerson). Refused while a turn runs and for someone with no card. */
  function startEdit(id) {
    const s = State.current;
    const n = s && !State.muted ? State.npc(id) : null;
    if (!n || !hasCard(s, n)) return false;
    if (busy || Pipeline.busy) { toast(App.BUSY_NOTICE); return false; }
    editing = { id, base: editBase(n), draft: null, error: '' };
    openPerson = id;
    renderPanel();
    const form = $('.pedit', d.panelBody);
    if (form) {
      if (!isMobile()) $('[name="name"]', form).focus({ preventScroll: true });
      const card = form.closest('.pcard');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }
    return true;
  }
  /* /edit <name> (UI.editPerson): the People panel, with that person's card
     open in edit mode. false when they have no card or a turn is running. */
  function editPersonFromCommand(id) {
    const s = State.current;
    const n = s && State.npc(id);
    if (!n || !hasCard(s, n)) return false;
    if (busy || Pipeline.busy) { toast(App.BUSY_NOTICE); return false; }
    tab = 'people';
    if (isMobile()) openSheet(); else setCollapsed(false);
    return startEdit(id);
  }
  function focusEdit(id) { const b = document.getElementById('pedit-btn-' + id); if (b) b.focus({ preventScroll: true }); }
  function cancelEdit() {
    const id = editing && editing.id;
    editing = null;
    renderPanel();
    if (id) focusEdit(id);
  }
  /* Save: one engine edit, or nothing when nothing differs. A refusal (the
     engine's reason, in the feed and above the buttons) keeps the form
     open with everything typed. */
  function saveEdit() {
    if (!editing) return null;
    const form = $('.pedit', d.panelBody);
    if (form) editing.draft = readForm(form);
    if (busy || Pipeline.busy) { toast(App.BUSY_NOTICE); return { ok: false, reason: 'busy' }; }
    const keep = editing;
    const fields = editChanges(keep.base, keep.draft || keep.base);
    editing = null;
    const r = Object.keys(fields).length ? App.editPerson(keep.id, fields) : { ok: true, same: true, fields: [] };
    if (!r.ok) {
      editing = Object.assign(keep, { error: r.why ? `Not saved: ${r.why}.` : 'Not saved.' });
      renderPanel();
      const save = $('.pedit-save', d.panelBody);
      if (save) save.focus({ preventScroll: true });
      return r;
    }
    renderPanel();
    focusEdit(keep.id);
    return r;
  }
  // ----- Places: the town map -----
  /* An inline SVG at the top of the Places tab, drawn from state on every
     panel render. The town's map (TOWN_DATA.map: width, height, river and
     riverWidth, riverLabel, bridges, decorative roads, labels) is the frame;
     each discovered place is a marker at its map { x, y } with its short
     label on the anchor side (n, s, e, w). A place without coordinates goes
     beside its first mapped exit, else on a grid. Roads come from exits:
     each connected pair once, a gentle curve toward open space and never
     into the river. People the player has met sit under the label
     of the place they were last seen (state.seen), or of this place if they
     are here now: three at most, then "+N". Tapping another place shows a
     "Go to ...?" chip beside it; the chip sends the Do turn "I head to
     <place>." through Pipeline.submit, so a stray tap never spends a turn.
     The current place, or any tap while a turn runs, does nothing. A place
     someone told the player about (State placesRevealed) uses the point
     stored with it and has a dashed outline marker ("Heard of" in the
     legend) until the player has been there. */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAP_SIZE = { width: 360, height: 300 };
  const MAP_ANCHORS = ['n', 's', 'e', 'w'];
  // Marker glyphs by place type: a boat-ramp wedge, a small square (a stop
  // by the road), else a house-ish pentagon.
  const MAP_WEDGE = ['marina', 'docks', 'dock', 'landing', 'ramp', 'riverbank', 'wharf', 'pier'];
  const MAP_SQUARE = ['gas', 'pawn', 'garage', 'market', 'shop', 'store', 'bridge', 'road', 'highway'];
  /* The id of the place whose "Go to" chip is showing (memory only). */
  let mapPick = null;
  function sv(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (let i = 2; i < arguments.length; i++) appendKids(node, arguments[i]);
    return node;
  }
  const r1 = n => Math.round(n * 10) / 10;
  /* "The Low Water" -> "the Low Water", for "Go to ..." and "I head to ...". */
  function placePhrase(name) { return String(name || '').replace(/^The /, 'the '); }
  /* The map data: this game's town (a save carries its own), or the built-in
     town's for a save of the same town made before it had a map. */
  function mapSource(s) {
    const t = State.town;
    const same = s.meta.townName === TOWN_DATA.name;
    const map = t && isObj(t.map) ? t.map : same && isObj(TOWN_DATA.map) ? TOWN_DATA.map : null;
    const coords = id => {
      const from = (t && Array.isArray(t.locations) ? t.locations.find(l => l.id === id) : null) || (same ? TOWN_DATA.locations.find(l => l.id === id) : null);
      return from && isObj(from.map) ? from.map : null;
    };
    return { map, coords };
  }
  /* A label of one to three words: the given one, else the name without
     "The". Longer than 13 letters with two or more words: two lines. */
  function mapLabelLines(label, name) {
    const words = cleanText(label || String(name || '').replace(/^The /, ''), 40).split(' ').filter(Boolean).slice(0, 3);
    const text = words.join(' ') || '?';
    if (text.length <= 13 || words.length < 2) return [text];
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      if (!best || Math.max(a.length, b.length) < Math.max(best[0].length, best[1].length)) best = [a, b];
    }
    return best;
  }
  /* Where everything goes, in viewBox units. */
  function mapLayout(s) {
    const src = mapSource(s);
    const m = src.map || {};
    const W = Number.isFinite(m.width) && m.width >= 120 ? m.width : MAP_SIZE.width;
    const H = Number.isFinite(m.height) && m.height >= 100 ? m.height : MAP_SIZE.height;
    const pts = [];
    const byId = {};
    const unplaced = [];
    for (const l of s.locations) {
      if (!l.discovered || l.away === true) continue;
      const c = isObj(l.map) ? l.map : src.coords(l.id);
      const p = { id: l.id, loc: l, lines: mapLabelLines(c && c.label, l.name), anchor: c && MAP_ANCHORS.includes(c.anchor) ? c.anchor : null };
      if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) { p.x = clamp(c.x, 0, W); p.y = clamp(c.y, 0, H); byId[l.id] = p; } else unplaced.push(p);
      pts.push(p);
    }
    // Fallback: beside the first exit that has a place on the map, else the first free cell of a grid.
    const free = (x, y) => x >= 24 && x <= W - 24 && y >= 20 && y <= H - 20 && pts.every(q => q.x === undefined || Math.hypot(q.x - x, q.y - y) >= 46);
    for (const p of unplaced) {
      let spot = null;
      const near = p.loc.exits.map(id => byId[id]).find(Boolean);
      for (let i = 0; near && !spot && i < 8; i++) {
        const a = Math.PI / 2 + i * Math.PI / 4;
        const x = near.x + Math.cos(a) * 54;
        const y = near.y - Math.sin(a) * 54;
        if (free(x, y)) spot = { x, y };
      }
      const cols = Math.max(1, Math.floor((W - 48) / 64) + 1);
      const step = (W - 48) / Math.max(1, cols - 1);
      for (let r = 0; !spot && 40 + r * 56 <= H - 20; r++) {
        for (let c = 0; !spot && c < cols; c++) if (free(24 + c * step, 40 + r * 56)) spot = { x: 24 + c * step, y: 40 + r * 56 };
      }
      p.x = spot ? r1(spot.x) : W / 2;
      p.y = spot ? r1(spot.y) : H / 2;
      byId[p.id] = p;
    }
    for (const p of pts) if (!p.anchor) p.anchor = p.x > W * 0.66 ? 'w' : 'e';
    const river = typeof m.river === 'string' && m.river ? m.river : null;
    const rw = Number.isFinite(m.riverWidth) && m.riverWidth > 0 ? m.riverWidth : 34;
    // Roads: each pair of connected places once.
    const roads = [];
    const pairs = new Set();
    for (const p of pts) {
      for (const id of p.loc.exits) {
        const q = byId[id];
        const key = [p.id, id].sort().join('|');
        if (!q || q === p || pairs.has(key)) continue;
        pairs.add(key);
        roads.push({ a: p, b: q, key });
      }
    }
    const L = { W, H, m, pts, byId, roads, river, rw, riverPts: river ? riverPoints(river) : [] };
    for (const r of roads) r.d = roadPath(r.a, r.b, L);
    return L;
  }
  /* Points along the river's centre line, to keep roads out of the water. */
  let riverCache = { d: null, pts: [] };
  function riverPoints(dPath) {
    if (riverCache.d === dPath) return riverCache.pts;
    let pts = [];
    try {
      const p = sv('path', { d: dPath });
      const len = p.getTotalLength();
      for (let i = 0; i <= 90; i++) { const q = p.getPointAtLength(len * i / 90); pts.push({ x: q.x, y: q.y }); }
    } catch (e) { pts = []; }
    riverCache = { d: dPath, pts };
    return pts;
  }
  /* A road between two places: a quadratic curve that bows up to 10 units
     off the straight line, to the side with more room from other places
     (north when it makes no difference), never into the river (straight if
     both sides would touch it). */
  function roadPath(a, b, L) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const dev = Math.min(10, len * 0.08);
    const at = (sgn, t) => {
      const cx = (a.x + b.x) / 2 + nx * dev * 2 * sgn;
      const cy = (a.y + b.y) / 2 + ny * dev * 2 * sgn;
      const u = 1 - t;
      return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y, cx, cy };
    };
    const ts = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9];
    const room = sgn => {
      let c = Infinity;
      for (const t of ts) {
        const q = at(sgn, t);
        for (const p of L.pts) if (p !== a && p !== b) c = Math.min(c, Math.hypot(p.x - q.x, p.y - q.y));
      }
      return c;
    };
    const wet = sgn => ts.some(t => { const q = at(sgn, t); return L.riverPts.some(w => Math.hypot(w.x - q.x, w.y - q.y) < L.rw / 2 + 4); });
    let sgn = ny > 0 ? -1 : 1;
    if (room(-sgn) > room(sgn) + 4) sgn = -sgn;
    if (wet(sgn)) sgn = wet(-sgn) ? 0 : -sgn;
    const c = at(sgn, 0.5);
    return `M${r1(a.x)},${r1(a.y)} Q${r1(c.cx)},${r1(c.cy)} ${r1(b.x)},${r1(b.y)}`;
  }
  /* Who the player has met (the People tab's list), by the place they are
     shown at: here if they are here now, else where they were last seen.
     Most recently seen first. Not the dead or the gone. */
  function mapPeople(s) {
    const hereIds = State.npcsAt(s.player.locationId).map(n => n.id);
    const seen = s.seen || {};
    const at = {};
    for (const n of s.npcs) {
      if (n.alive === false || n.status === 'gone' || n.status === 'dead' || !hasMet(s, n)) continue;
      const isHere = hereIds.includes(n.id);
      const locId = isHere ? s.player.locationId : seen[n.id] && seen[n.id].locationId;
      if (!locId) continue;
      (at[locId] = at[locId] || []).push({ n, t: isHere ? Infinity : seen[n.id].turn | 0 });
    }
    for (const k of Object.keys(at)) at[k] = at[k].sort((a, b) => b.t - a.t).map(x => x.n);
    return at;
  }
  function mapGlyph(p) {
    const x = p.x;
    const y = p.y;
    const t = p.loc.type;
    if (MAP_WEDGE.includes(t)) return sv('path', { class: 'map-mark', 'data-glyph': 'wedge', d: `M${r1(x - 7)},${r1(y + 5)} L${r1(x + 7)},${r1(y + 5)} L${r1(x + 7)},${r1(y - 5)} Z` });
    if (MAP_SQUARE.includes(t)) return sv('rect', { class: 'map-mark', 'data-glyph': 'square', x: r1(x - 5), y: r1(y - 5), width: 10, height: 10, rx: 1 });
    return sv('path', { class: 'map-mark', 'data-glyph': 'house', d: `M${r1(x)},${r1(y - 7)} L${r1(x + 6.5)},${r1(y - 1.5)} L${r1(x + 6.5)},${r1(y + 6)} L${r1(x - 6.5)},${r1(y + 6)} L${r1(x - 6.5)},${r1(y - 1.5)} Z` });
  }
  /* One place: the hit area (44px or more on screen), the ring if the player
     is here, the marker, a strike if closed, then the label block: the label,
     "You are here", and the people seen there. */
  /* A place the player has only heard of: told about, never visited. */
  function heardOf(l) { return !!l && isObj(l.revealed) && !l.revealed.visited; }
  function mapPlace(s, L, p, people, u) {
    const here = p.id === s.player.locationId;
    const closed = !!p.loc.closed;
    const heard = heardOf(p.loc) && !here;
    const shown = people.slice(0, 3);
    const extra = people.length - shown.length;
    const kids = [sv('rect', { class: 'map-hit', x: r1(p.x - u.hit / 2), y: r1(p.y - u.hit / 2), width: u.hit, height: u.hit, rx: 8 })];
    if (here) kids.push(sv('circle', { class: 'map-ring', cx: r1(p.x), cy: r1(p.y), r: 11.5 }));
    kids.push(mapGlyph(p));
    if (closed) kids.push(sv('line', { class: 'map-strike', x1: r1(p.x - 9), y1: r1(p.y + 8), x2: r1(p.x + 9), y2: r1(p.y - 8) }));
    // The label block, sized by estimate (0.58em a letter) and kept inside the map.
    const rows = p.lines.map(t => ({ t, cls: 'map-label' + (closed ? ' struck' : '') }));
    if (here) rows.push({ t: 'You are here', cls: 'map-caption' });
    const textW = Math.max(...rows.map(r => r.t.length * u.fs * 0.58));
    const more = extra > 0 ? `+${extra}` : '';
    const rowW = shown.length ? shown.length * u.mono + (shown.length - 1) * 2 + (more ? 3 + more.length * u.fs * 0.6 : 0) : 0;
    const blockW = Math.max(textW, rowW);
    const blockH = rows.length * u.lh + (shown.length ? u.mono + 3 : 0);
    const gap = 11;
    const align = p.anchor === 'e' ? 'start' : p.anchor === 'w' ? 'end' : 'middle';
    let x0 = p.anchor === 'e' ? p.x + gap : p.anchor === 'w' ? p.x - gap : p.x;
    let top = p.anchor === 'n' ? p.y - gap - blockH : p.anchor === 's' ? p.y + gap : p.y - (p.lines.length * u.lh) / 2;
    const left = align === 'start' ? x0 : align === 'end' ? x0 - blockW : x0 - blockW / 2;
    x0 += clamp(left, 3, L.W - 3 - blockW) - left;
    top = clamp(top, 2, L.H - 2 - blockH);
    rows.forEach((r, i) => kids.push(sv('text', { class: r.cls, x: r1(x0), y: r1(top + i * u.lh + u.fs * 0.84), 'text-anchor': align }, r.t)));
    if (shown.length) {
      const cy = top + rows.length * u.lh + 1.5 + u.mono / 2;
      let cx = align === 'start' ? x0 + u.mono / 2 : align === 'end' ? x0 - rowW + u.mono / 2 : x0 - rowW / 2 + u.mono / 2;
      for (const n of shown) {
        const label = npcLabel(n);
        kids.push(sv('g', { class: 'map-mono', dataset: { npc: n.id, hue: String(personHue(n.id)) } },
          sv('title', null, label),
          sv('circle', { cx: r1(cx), cy: r1(cy), r: r1(u.mono / 2) }),
          sv('text', { x: r1(cx), y: r1(cy + u.mono * 0.19), 'text-anchor': 'middle', 'font-size': r1(u.mono * 0.52) }, initials(label))));
        cx += u.mono + 2;
      }
      if (more) kids.push(sv('text', { class: 'map-more', x: r1(cx - u.mono / 2 + 1), y: r1(cy + u.fs * 0.34) }, more));
    }
    const who = people.map(npcLabel);
    const aria = [p.loc.name, here ? 'you are here' : null, heard ? 'heard of, not visited yet' : null, closed ? 'closed' : null, who.length ? 'with ' + who.join(', ') : null].filter(Boolean).join(', ');
    const tap = e => { if (e) e.stopPropagation(); mapTap(p.id, false); };
    return sv('g', {
      class: 'map-place', role: 'button', tabindex: '0', 'aria-label': aria, 'aria-current': here ? 'location' : null, 'aria-disabled': here ? 'true' : null,
      dataset: { loc: p.id, here: here ? '1' : '0', closed: closed ? '1' : '0', heard: heard ? '1' : '0', picked: mapPick === p.id ? '1' : '0', glyph: kids[here ? 2 : 1].getAttribute('data-glyph') },
      onclick: tap,
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); mapTap(p.id, true); } }
    }, kids);
  }
  /* Game.UI.renderMap(): the map node (a div holding the SVG and, when a
     place is picked, its chip). */
  function renderMap(s) {
    s = s || State.current;
    if (!s) return null;
    const L = mapLayout(s);
    const m = L.m;
    if (mapPick && (mapPick === s.player.locationId || !L.byId[mapPick])) mapPick = null;
    // Sizes in viewBox units, so labels are 11px or more on a map 316px wide
    // (the laptop panel is 319, a 375px phone's sheet 375) and taps hit 44px.
    const k = L.W / 316;
    const u = { fs: r1(11 * k), lh: r1(13.2 * k), hit: Math.ceil(44 * k), mono: r1(14 * k) };
    const people = mapPeople(s);
    const rw = L.rw;
    const text = (cls, o) => (isObj(o) && typeof o.text === 'string' && Number.isFinite(o.x) && Number.isFinite(o.y)
      ? sv('text', { class: cls, x: o.x, y: o.y, 'text-anchor': ['start', 'middle', 'end'].includes(o.anchor) ? o.anchor : 'middle', transform: Number.isFinite(o.rotate) ? `rotate(${o.rotate} ${o.x} ${o.y})` : null }, cleanText(o.text, 40))
      : null);
    const paths = v => (Array.isArray(v) ? v : []).filter(d => typeof d === 'string' && d.trim());
    const svg = sv('svg', {
      class: 'map-svg', viewBox: `0 0 ${L.W} ${L.H}`, role: 'group', 'aria-label': `Map of ${s.meta.townName}`, 'font-size': u.fs,
      onclick: () => { if (mapPick) setPick(null); }
    },
    sv('rect', { class: 'map-land', x: 0, y: 0, width: L.W, height: L.H }),
    L.river ? [
      sv('path', { class: 'map-bank', d: L.river, 'stroke-width': rw + 5, 'aria-hidden': 'true' }),
      sv('path', { class: 'map-water', d: L.river, 'stroke-width': rw, 'aria-hidden': 'true' })] : null,
    sv('g', { class: 'map-roads', 'aria-hidden': 'true' },
      paths(m.roads).map(d => sv('path', { class: 'map-road deco', d })),
      L.roads.map(r => sv('path', { class: 'map-road', d: r.d, dataset: { road: r.key } }))),
    paths(m.bridges).map(d => sv('g', { class: 'map-bridge', 'aria-hidden': 'true' }, sv('path', { class: 'map-bridge-rail', d }), sv('path', { class: 'map-bridge-deck', d }))),
    sv('g', { 'aria-hidden': 'true' }, text('map-river-label', m.riverLabel), (Array.isArray(m.labels) ? m.labels : []).map(o => text('map-area', o))),
    L.pts.map(p => mapPlace(s, L, p, people[p.id] || [], u)));
    const pick = mapPick ? L.byId[mapPick] : null;
    const chip = pick ? el('button', {
      type: 'button', class: 'map-go', disabled: busy || Pipeline.busy,
      dataset: { loc: pick.id, side: pick.y < L.H * 0.55 ? 'below' : 'above', fx: String(pick.x / L.W) },
      style: `left:${r1(pick.x / L.W * 100)}%;top:${r1(pick.y / L.H * 100)}%`,
      onclick: e => { e.stopPropagation(); confirmTravel(); },
      onkeydown: e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPick(null, pick.id); } }
    }, `Go to ${placePhrase(pick.loc.name)}${pick.loc.closed ? ' (closed)' : ''}?`) : null;
    return el('div', { class: 'map', dataset: { pick: mapPick || '' } }, svg, chip);
  }
  /* "Heard of" is listed only while a dashed marker is on the map. */
  function mapLegend(s) {
    const heard = !!s && s.locations.some(l => l.discovered && heardOf(l) && l.id !== s.player.locationId);
    return el('p', { class: 'map-legend', 'aria-hidden': 'true' },
      el('span', null, el('i', { class: 'lg lg-you' }), 'You'),
      el('span', null, el('i', { class: 'lg lg-closed' }), 'Closed'),
      heard ? el('span', null, el('i', { class: 'lg lg-heard' }), 'Heard of') : null,
      el('span', null, el('i', { class: 'lg lg-person' }), 'Someone you know'));
  }
  /* Put the chip under or over its marker, whichever hides fewer marks,
     labels and people, centred where it fits and kept inside the map. */
  function placeChip(node) {
    const chip = node && $('.map-go', node);
    const w = node ? node.clientWidth : 0;
    const h = node ? node.clientHeight : 0;
    if (!chip || !w || !h) return;
    const cw = chip.offsetWidth;
    const ch = chip.offsetHeight;
    const box = node.getBoundingClientRect();
    const mine = $(`.map-place[data-loc="${chip.dataset.loc}"]`, node);
    const mark = mine ? $('.map-mark', mine).getBoundingClientRect() : null;
    const mx = mark ? mark.left + mark.width / 2 - box.left : parseFloat(chip.dataset.fx) * w;
    const my = mark ? mark.top + mark.height / 2 - box.top : h / 2;
    const left = clamp(mx - cw / 2, 8, Math.max(8, w - cw - 8));
    const others = $$('.map-mark, .map-label, .map-caption, .map-mono', node).filter(x => !mine || !mine.contains(x)).map(x => x.getBoundingClientRect());
    const hides = top => others.filter(r => r.right - box.left > left && r.left - box.left < left + cw && r.bottom - box.top > top && r.top - box.top < top + ch).length;
    const below = clamp(my + 16, 4, Math.max(4, h - ch - 4));
    const above = clamp(my - 16 - ch, 4, Math.max(4, h - ch - 4));
    const first = chip.dataset.side === 'above' ? [above, below] : [below, above];
    const top = hides(first[1]) < hides(first[0]) ? first[1] : first[0];
    chip.style.left = r1(left) + 'px';
    chip.style.top = r1(top) + 'px';
    chip.dataset.side = top === below ? 'below' : 'above';
    chip.classList.add('placed');
  }
  /* Redraw only the map (a pick or its end), then focus the chip or a place
     (keyboard use). */
  function refreshMap(focus) {
    const old = d.panelBody ? $('.map', d.panelBody) : null;
    if (!old || !State.current) return;
    const fresh = renderMap(State.current);
    old.replaceWith(fresh);
    placeChip(fresh);
    const f = focus === 'chip' ? $('.map-go', fresh) : focus ? $(`.map-place[data-loc="${focus}"]`, fresh) : null;
    if (f) f.focus({ preventScroll: true });
  }
  function setPick(id, focus) { mapPick = id; refreshMap(focus); }
  /* A tap (or Enter / Space) on a place: another place shows its chip (a
     second tap takes it away again); the current place, or any tap while a
     turn runs, does nothing. Returns whether a chip is showing. */
  function mapTap(id, viaKey) {
    const s = State.current;
    if (!s || State.muted || busy || Pipeline.busy) return false;
    if (id === s.player.locationId) { if (mapPick) setPick(null, viaKey ? id : null); return false; }
    const next = mapPick === id ? null : id;
    setPick(next, viaKey ? (next ? 'chip' : id) : null);
    return !!next;
  }
  /* The chip: the Do turn "I head to <place>." On a phone the sheet closes so
     the walk can be read. A failed turn leaves the line in the box, like a
     typed one. */
  async function confirmTravel() {
    const s = State.current;
    const l = mapPick && State.loc(mapPick);
    if (!s || !l || busy || Pipeline.busy || l.id === s.player.locationId) return null;
    const line = `I head to ${placePhrase(l.name)}.`;
    setPick(null);
    if (isMobile()) closeSheet();
    let res = null;
    try { res = await Pipeline.submit(line, { mode: 'do', to: 'everyone' }); } catch (e) { console.error(e); res = { restoreInput: true }; }
    if (res && res.restoreInput && !d.cmd.value) { d.cmd.value = line; autosize(); }
    return res;
  }
  function kv(rows) { return el('dl', { class: 'kv' }, rows.map(([k, v]) => [el('dt', null, k), el('dd', null, v)])); }
  // ----- Places: a sheet for every place -----
  /* Under the map, each place the player knows (and each place out of
     town) is a row that opens in place to its sheet: what it looks like,
     what you notice inside, when it is open, how it came to be, who lives
     or works there and who is there now. People the player has not met
     show by their label, never by name; the dead and the far away only
     once heard of. One sheet open at a time, in memory only (openPlace). */
  let openPlace = null;
  const joinList = list => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
  /* Names the player knows, then how many more they have not met: "Royce Pittman, Dewayne Mangum and 3 you have not met". */
  function namesAndStrangers(s, list) {
    const known = list.filter(n => n.knownToPlayer || heardOfOnly(s, n)).map(n => n.name);
    const more = list.length - known.length;
    if (more) known.push(more === 1 ? (known.length ? '1 more you have not met' : 'someone you have not met') : `${more} ${known.length ? 'more ' : ''}you have not met`);
    return known;
  }
  function placePeople(s, l) {
    const label = list => namesAndStrangers(s, list);
    const lives = s.npcs.filter(n => n.home && n.home.locationId === l.id && (presenceOf(n) === 'here' || hasMet(s, n)));
    const scheduled = new Set();
    const t = State.town;
    const src = t && Array.isArray(t.locations) ? t.locations.find(x => x.id === l.id) : null;
    for (const sch of [l.npcIdsBySchedule, src && src.npcIdsBySchedule]) for (const p of PHASES) for (const id of ((sch || {})[p] || [])) scheduled.add(id);
    const works = s.npcs.filter(n => scheduled.has(n.id) && !lives.includes(n) && presenceOf(n) === 'here');
    const buried = s.npcs.filter(n => n.buried === l.id && hasMet(s, n));
    const now = l.away === true ? [] : State.npcsAt(l.id);
    return { lives: label(lives), works: label(works), buried: buried.map(n => n.name), now: label(now) };
  }
  function placeCard(s, l, here) {
    const open = openPlace === l.id;
    const tag = l.away === true ? '' : `${l.id === here.id ? ' (here)' : ''}${heardOf(l) && l.id !== here.id ? ' (heard of)' : ''}${l.closed ? ' (closed)' : ''}`;
    const id = 'plmore-' + l.id;
    const who = open ? placePeople(s, l) : null;
    const rows = [];
    if (open) {
      if (l.away === true && l.distance) rows.push(['How far', l.distance]);
      if (l.details) rows.push(['Inside', l.details]);
      if (l.hours) rows.push(['Hours', l.hours]);
      if (l.history) rows.push(['History', l.history]);
      if (who.lives.length) rows.push([l.away === true ? 'Lives there' : 'Lives here', joinList(who.lives)]);
      if (who.works.length) rows.push(['Works or regulars', joinList(who.works)]);
      if (who.buried.length) rows.push(['Buried here', joinList(who.buried)]);
      // Paid work at this place (direction change 16): what, for whom (by name once met) and when.
      const work = l.away === true ? [] : Town.jobsAt(l.id);
      if (work.length) rows.push(['Work here', work.map(workText).join('; ')]);
      if (l.away !== true) rows.push(['Here now', who.now.length ? joinList(who.now) : 'Nobody right now']);
    }
    return el('article', { class: 'plcard' + (open ? ' open' : '') + (l.away === true ? ' away' : ''), dataset: { loc: l.id } },
      el('button', { type: 'button', class: 'plcard-head', id: 'plhead-' + l.id, 'aria-expanded': String(open), 'aria-controls': id, onclick: () => togglePlace(l.id) },
        el('span', { class: 'plcard-name' }, `${l.name}${tag}`),
        el('span', { class: 'plcard-type' }, capFirst(l.type || 'place')),
        el('span', { class: 'pcard-chev', 'aria-hidden': 'true' })),
      el('div', { class: 'plcard-more', id, hidden: !open }, open ? [
        el('p', { class: 'plcard-desc' }, l.description),
        rows.length ? el('dl', { class: 'kv plcard-facts' }, rows.map(([k, v]) => [el('dt', null, k), el('dd', { dataset: { fact: k.toLowerCase().replace(/[^a-z]+/g, '-') } }, v)])) : null
      ] : null));
  }
  /* "A shift in the service bays at Pittman's (for Dewayne Mangum, morning and afternoon)", and "done for today" once worked. */
  function workText(j) {
    const done = Town.jobStatus(j);
    return `${capFirst(j.label)} (${j.stake ? 'with' : 'for'} ${npcLabel(State.npc(j.giverNpcId))}, ${Town.phaseList(j.phases)}${done ? `; ${done}` : ''})`;
  }
  /* Open one place's sheet (or close it). Game.UI.togglePlace(id, open?). */
  function togglePlace(id, want) {
    const on = typeof want === 'boolean' ? want : openPlace !== id;
    if (on) openPlace = id;
    else if (openPlace === id) openPlace = null;
    renderPanel();
    const head = document.getElementById('plhead-' + id);
    if (head && on) { head.focus({ preventScroll: true }); const card = head.closest('.plcard'); if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' }); }
    return openPlace;
  }
  const PANELS = {
    character(s) {
      const p = s.player;
      const bg = BACKGROUNDS.find(b => b.id === p.backgroundId);
      return [
        // The age beside the name ("Tester · 34"), then the background and its blurb.
        el('h2', { class: 'char-name' }, p.name, ageText(p.age) ? el('span', { class: 'char-age', title: 'Age' }, ` · ${p.age}`) : null),
        el('p', { class: 'muted' }, p.background),
        bg && bg.blurb ? el('p', { class: 'char-blurb' }, bg.blurb) : null,
        el('div', { class: 'stat-grid' }, STATS.map(k => el('div', { class: 'stat' }, el('span', { class: 'stat-name' }, capFirst(k)), el('span', { class: 'stat-val', dataset: { stat: k } }, fmtMod(p.stats[k]))))),
        kv([['HP', `${p.hp} / ${p.maxHp}`], [moneyLabel(), currency() ? money(p.gold) : String(p.gold)], ['Story points', `${p.storyPoints} / ${State.LIMITS.storyPoints}`], ['Reputation', capFirst(State.reputationTier())]]),
        el('h3', null, 'Goal'), el('p', null, p.goal || '—'),
        el('h3', null, 'Flaw'), el('p', null, p.flaw || '—'),
        el('h3', null, 'Conditions'),
        list(p.conditions, c => `${c.name}${c.effect ? ' (' + c.effect + ')' : ''}${c.untilDay ? ', until day ' + c.untilDay : ''}`, 'None.'),
        el('h3', null, 'Inventory'),
        list(p.inventory, i => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}${i.notes ? ' — ' + i.notes : ''}`, 'Nothing.')
      ];
    },
    /* Person cards: who is here now, then everyone else the player has met,
       most recently seen first. Only what the player could know: name (or
       how they would describe a stranger), role, attitude, where they were
       last seen, their look, and notes (what they said, what they remember,
       loose ends, known threads). Never secrets, goals, factions or seeds. */
    people(s) {
      const here = State.npcsAt(s.player.locationId);
      // The dead and the people who live elsewhere, once the player has heard of them: Elsewhere and Gone, never Here now.
      const inTown = n => presenceOf(n) === 'here';
      const heard = s.npcs.filter(n => inTown(n) && heardOfOnly(s, n) && !here.includes(n));
      const people = s.npcs.filter(n => inTown(n) && (hasMet(s, n) || (heardOfOnly(s, n) && here.includes(n))));
      const elsewhere = s.npcs.filter(n => presenceOf(n) === 'away' && hasMet(s, n));
      const gone = s.npcs.filter(n => presenceOf(n) === 'dead' && hasMet(s, n));
      if (!people.length && !heard.length && !elsewhere.length && !gone.length) return el('p', { class: 'empty' }, "You haven't met anyone yet.");
      const hereIds = here.map(n => n.id);
      const now = here.filter(n => people.includes(n));
      const seen = s.seen || {};
      const rest = people.filter(n => !hereIds.includes(n.id))
        .map((n, i) => ({ n, i, t: seen[n.id] ? seen[n.id].turn : -1 }))
        .sort((a, b) => (b.t - a.t) || (a.i - b.i)).map(x => x.n);
      const group = (key, title, list) => (list.length ? el('section', { class: 'people-group', dataset: { group: key }, 'aria-label': title },
        el('h3', null, title, el('span', { class: 'people-count' }, String(list.length))),
        el('div', { class: 'people-list' }, list.map(n => personCard(s, n, hereIds.includes(n.id))))) : null);
      return [group('here', 'Here now', now), group('known', 'Known', rest), group('heard', 'Heard of', heard), group('elsewhere', 'Elsewhere', elsewhere), group('gone', 'Gone', gone)];
    },
    journal(s) {
      const threads = s.threads.filter(t => t.knownToPlayer);
      return [
        el('h3', null, 'Threads'),
        threads.length
          ? el('ul', null, threads.map(t => el('li', { dataset: { thread: t.id } }, el('strong', null, t.title),
            t.status !== 'open' ? el('span', { class: 'thread-status' }, t.status) : null,
            t.summary ? el('div', { class: 'muted' }, t.summary) : null)))
          : el('p', { class: 'empty' }, 'Nothing yet.'),
        el('h3', null, 'Journal'),
        list(s.journal.slice().reverse(), j => `Turn ${j.turn}: ${j.text}`, 'No entries yet.')
      ];
    },
    places(s) {
      const here = State.loc(s.player.locationId);
      const exits = here.exits.map(id => State.loc(id)).filter(Boolean);
      const known = s.locations.filter(l => l.discovered && l.away !== true);
      const away = s.locations.filter(l => l.away === true);
      return [
        renderMap(s),
        mapLegend(s),
        el('h2', null, here.name),
        el('p', { class: 'muted' }, capFirst(here.type) + (here.closed ? ' · closed' : '')),
        el('p', null, here.description),
        el('h3', null, 'Exits from here'),
        list(exits, l => `${l.name}${heardOf(l) ? ' (heard of)' : ''}${l.closed ? ' (closed)' : ''}`, 'None.'),
        el('h3', null, 'Places you know'),
        known.length ? el('div', { class: 'place-list', dataset: { list: 'known' } }, known.map(l => placeCard(s, l, here))) : el('p', { class: 'empty' }, 'None.'),
        away.length ? [el('h3', null, 'Out of town'),
          el('p', { class: 'hint place-hint' }, "Places people talk about. The story stays in town, so you can't go to them."),
          el('div', { class: 'place-list', dataset: { list: 'away' } }, away.map(l => placeCard(s, l, here)))] : null
      ];
    },
    /* Debug view (/debug): everything hidden from the player, and only
       here. Plain-text blocks that wrap, so it reads on a phone too. */
    debug(s) {
      const pre = v => el('pre', null, typeof v === 'string' ? v : JSON.stringify(v, null, 1));
      const bar = c => '\u25A0'.repeat(clamp(c.filled | 0, 0, c.segments)) + '\u25A1'.repeat(Math.max(0, c.segments - (c.filled | 0)));
      // One line per faction to read at a glance, then the details.
      const glance = s.factions.map(f => {
        const c = World.activeClock(f);
        return c ? `${f.id} ${bar(c)} ${c.filled}/${c.segments} (${f.activeClock + 1} of ${f.clocks.length})` : `${f.id} done`;
      }).join('\n');
      const clocks = glance + '\n\n' + s.factions.map(f => {
        const c = World.activeClock(f);
        const next = c ? f.clocks[f.activeClock + 1] : null;
        const rel = Object.keys(f.relations || {}).map(k => `${k} ${f.relations[k]}`).join(', ');
        const lines = [`${f.name} (${f.id})`];
        lines.push(c ? `  ${bar(c)} ${c.filled}/${c.segments} "${c.label}" (clock ${f.activeClock + 1} of ${f.clocks.length})` : `  all ${f.clocks.length} clocks done`);
        if (c) lines.push(`  on complete: ${(c.onComplete && c.onComplete.text) || '-'}`);
        lines.push(`  next clock: ${next ? `"${next.label}"` : 'none'}`);
        lines.push(`  goal: ${f.goal || '-'}`);
        if (rel) lines.push(`  relations: ${rel}`);
        return lines.join('\n');
      }).join('\n');
      const forcedRolls = Object.keys(World.hooks.clockRolls).map(k => `${k === '*' ? 'every faction' : k} ${World.hooks.clockRolls[k]}`).join(', ');
      const forced = forcedRolls ? `\nforced clock rolls: ${forcedRolls}` : '';
      const due = (s.dueEvents || []).map(e => `${e.seedId} (fired turn ${e.firedTurn}, day ${e.firedDay}${e.npcId ? ', ' + e.npcId : ''}${e.bring ? ', comes to the player' : ''})\n  ${e.text}`).join('\n');
      const visits = (s.visits || []).map(v => `visit: ${v.npcId} at ${v.locationId} (day ${v.day} ${v.phase})`).join('\n');
      const fights = (s.fights || []).map(f => `fight waiting: ${f.npcId} comes at the player${f.seedId ? ` when ${f.seedId} is told` : ' next turn'}${f.reason ? ` (${f.reason})` : ''}`).join('\n');
      const work = Object.keys(isObj(s.work) ? s.work : {}).map(k => `${k} day ${s.work[k].day} (${s.work[k].outcome}, ${s.work[k].times}x)`).join(', ');
      const seeds = s.seeds.map(sd => `[${World.seedStatus(sd)}] ${sd.id} @ ${sd.trigger.type} ${sd.trigger.value}${sd.notBeforeDay ? ' (not before day ' + sd.notBeforeDay + ')' : ''}${sd.notBeforeTurn ? ' (not before turn ' + sd.notBeforeTurn + ')' : ''}${sd.origin ? ' · ' + sd.origin.kind + (sd.origin.npcId ? ' ' + sd.origin.npcId : '') : ''}${Array.isArray(sd.effects) && sd.effects.length ? ' · then ' + sd.effects.map(e => e.op).join(', ') : ''}\n  ${sd.effect}`).join('\n');
      const npcs = s.npcs.map(n => `${n.name} [${n.id}] ${n.alive === false ? 'dead' : n.status} att ${n.attitude} (${State.attitudeWord(n.attitude)})${n.knownToPlayer ? ' known' : ''} · now ${World.whereIs(n.id) || 'off-screen'}${n.home ? ' · home ' + n.home.locationId : ''} · ${pronounLabel(n.pronouns)}${isObj(n.created) ? ` · made by ${n.created.by}${n.created.relationToNpcId ? ` (${n.created.relation || 'related'} of ${n.created.relationToNpcId})` : ''}${n.unnamed ? ', no name yet' : ''}` : ''}\n  goal: ${n.goal}\n  secret: ${n.secret || '-'}\n  memories: ${n.memories.map(m => `(${m.weight}, t${m.turn}) ${m.text}`).join(' | ') || '-'}`).join('\n');
      const rumours = s.rumours.map(r => `${r.heard ? '[heard] ' : '[unheard] '}${r.true ? 'TRUE ' : 'FALSE'} ${r.id}${r.sourceNpcId ? ' from ' + r.sourceNpcId : ''}${r.heardFrom ? ', told by ' + r.heardFrom : ''}${Array.isArray(r.knownBy) ? ` · known by ${r.knownBy.length}` : ''}${Number.isInteger(r.addedTurn) ? ` · news (turn ${r.addedTurn}${r.factionId ? ', ' + r.factionId : ''})` : ''}: ${r.text}`).join('\n');
      const threads = s.threads.map(t => `[${t.status}${t.knownToPlayer ? ', known' : ', hidden'}] ${t.id}: ${t.title}\n  ${t.summary}`).join('\n');
      const chron = s.chronicle.map(c => `turns ${c.fromTurn}-${c.toTurn}: ${c.summary}`).join('\n');
      const logSpan = s.log.length ? `log: ${s.log.length} entries, turns ${s.log[0].turn}-${s.log[s.log.length - 1].turn}` : 'log: empty';
      const events = World.recent.slice(-20).map(e => `turn ${e.turn} day ${e.day} ${e.phase}: ${e.text}`).join('\n');
      const rep = Object.keys(s.player.reputation).map(k => `${k} ${s.player.reputation[k]} (${State.reputationTier(k)})`).join(', ');
      const rejects = State.debugLog.filter(x => x.kind === 'rejected' || x.kind === 'style').slice(-15).map(x => x.kind === 'style' ? `turn ${x.turn} style (try ${x.attempt || 1}${x.kept ? ', kept' : ''}): ${x.problems.map(p => p.detail).join('; ')}` : `turn ${x.turn} ${x.source} ${x.path}: ${x.reason}`).join('\n');
      const apiErrors = State.debugLog.filter(x => x.kind === 'api' || x.kind === 'chronicle' || x.kind === 'upgrade').slice(-8).map(x => x.kind === 'chronicle' || x.kind === 'upgrade' ? `turn ${x.turn} ${x.kind === 'upgrade' ? 'update' : 'chronicle'}: ${x.reason}` : `turn ${x.turn} ${x.role}${x.status ? ' HTTP ' + x.status : ''}${x.requestId ? ' ' + x.requestId : ''}: ${x.reason}`).join('\n');
      const u = Api.usage;
      const fmtU = b => `${b.calls} calls, in ${b.input}, out ${b.output}, cache read ${b.cacheRead}, cache write ${b.cacheCreation}${b.priced ? `, $${b.cost.toFixed(4)}` : ''}`;
      return el('div', { class: 'dbg' },
        el('h3', null, 'Meta'), pre(`turn ${s.meta.turn} · day ${s.time.day} ${s.time.phase} · seed ${s.meta.seed} · rng calls ${s.meta.rngCalls} · shorts ${s.time.shorts}${s.time.late ? ' (late night)' : ''}${s.time.noSleep ? ' · no sleep last night' : ''} · rules v${State.rulesVersion(s)}${Upgrade.behind(s) ? ` (current v${State.RULES_VERSION})` : ''}\nflags ${JSON.stringify(s.flags)}\nreputation ${rep}\nretry lock ${s.meta.lastRollKey || '-'}\nwork done ${work || '-'}\nundo depth ${State.undoDepth()}`),
        el('h3', null, 'Faction clocks'), pre((clocks || '-') + forced),
        el('h3', null, 'Due events'), pre([due, visits, fights].filter(Boolean).join('\n') || 'none'),
        el('h3', null, 'Seeds'), pre(seeds || '-'),
        el('h3', null, 'World events'), pre(events || 'none yet'),
        el('h3', null, 'NPCs (hidden)'), pre(npcs || '-'),
        el('h3', null, 'Rumours'), pre(rumours || '-'),
        el('h3', null, 'Threads'), pre(threads || '-'),
        el('h3', null, 'Chronicle'), pre(`${chron || 'none yet'}\n${logSpan}`),
        el('h3', null, 'Rejected changes'), pre(rejects || 'none'),
        el('h3', null, `API (${Api.providerName()})`), pre([`turn: ${fmtU(u.turn)}`, `session: ${fmtU(u.session)}`].concat(Object.keys(u.byRole || {}).map(k => `  ${k}: ${fmtU(u.byRole[k])}`)).join('\n')),
        el('h3', null, 'API errors'), pre(apiErrors || 'none'),
        el('h3', null, 'Last raw responses'), pre(Api.responses.slice(-4).map(r => {
          const head = [r.at, r.role, 'via ' + r.provider, r.status ? 'HTTP ' + r.status : '', r.requestId ? 'request-id ' + r.requestId : '', r.stopReason ? 'stop ' + r.stopReason : ''].filter(Boolean).join(' · ');
          const use = r.usage ? `\nusage ${JSON.stringify(r.usage)}` : '';
          const err = r.error ? `\nerror ${r.error.type}: ${r.error.message}` : '';
          return `${head}${use}${err}\n${JSON.stringify(r.data)}`;
        }).join('\n\n') || '-'));
    }
  };

  // ----- feed -----
  function nearBottom() { const f = d.feedScroll; return f.scrollHeight - f.scrollTop - f.clientHeight < 48; }
  function scrollToBottom() { d.feedScroll.scrollTop = d.feedScroll.scrollHeight; stick = true; d.newBtn.hidden = true; }
  function afterAppend() { if (stick) scrollToBottom(); else d.newBtn.hidden = false; }
  /* Mock narration carries a visible tag so it is never mistaken for the
     real narrator (the tag is not part of the narration text). */
  function fillParas(node, text) {
    const paras = String(text || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
    const tag = node.dataset.mock === '1' ? [el('p', { class: 'f-tag' }, 'Mock narration')] : [];
    node.replaceChildren(...tag, ...paras.map(t => el('p', null, t)));
  }
  function narrationNode(text, mock) { const n = el('div', { class: 'f-item f-narr', dataset: mock ? { mock: '1' } : null }); fillParas(n, text); return n; }
  function dividerNode(day, phase) { return el('div', { class: 'f-item f-divider', role: 'separator' }, `Day ${day} · ${capFirst(phase)}`); }
  function rollNode(r) { return el('p', { class: 'f-item f-roll' }, r.line); }
  /* A Do line is the text as typed; a Say line (a turn's speech or a log
     entry with mode 'say') is the words in quotes and who they were said to. */
  function inputNode(text, sp) {
    if (!isSay(sp)) return el('p', { class: 'f-item f-input' }, text);
    const npc = sp.to && sp.to !== 'everyone' && State.current ? State.current.npcs.find(n => n.id === sp.to) : null;
    const who = sp.toLabel || (npc ? npcLabel(npc) : (sp.to === 'everyone' || !sp.toName ? 'everyone' : sp.toName));
    return el('p', { class: 'f-item f-input f-say', dataset: { to: sp.to || 'everyone' } },
      el('span', { class: 'f-words' }, `\u201C${text}\u201D`), el('span', { class: 'f-to' }, ` \u2014 to ${who}`));
  }
  const feed = {
    add(node) { d.feed.append(node); afterAppend(); return node; },
    input(text, sp) { return feed.add(inputNode(text, sp)); },
    roll(r) { return r && Storage.settings().showRolls ? feed.add(rollNode(r)) : null; },
    narration(text, mock) { return feed.add(narrationNode(text, mock)); },
    beginNarration(opts) {
      const node = el('div', { class: 'f-item f-narr pending', 'aria-busy': 'true', dataset: opts && opts.mock ? { mock: '1' } : null });
      fillParas(node, '');
      return feed.add(node);
    },
    stream(node, soFar) { fillParas(node, soFar); afterAppend(); },
    endNarration(node, text) { fillParas(node, text); node.classList.remove('pending'); node.removeAttribute('aria-busy'); afterAppend(); },
    notice(text, kind) { return feed.add(el('p', { class: 'f-item f-notice' + (kind ? ' ' + kind : '') }, text)); },
    /* A quiet line that is always shown (damage, story points), unlike rolls. */
    quiet(text) { return feed.add(el('p', { class: 'f-item f-quiet' }, text)); },
    divider(day, phase) { return feed.add(dividerNode(day, phase)); },
    /* mark()/rollback(mark): take a failed turn's lines back out of the feed. */
    mark() { return d.feed.childElementCount; },
    rollback(mark) { while (d.feed.childElementCount > mark) d.feed.lastElementChild.remove(); },
    clear() { d.feed.replaceChildren(); }
  };
  function rebuildFeed() {
    const s = State.current;
    feed.clear();
    // A load, a new game or an undo: Say mode starts again from the default addressee, and an open editor closes.
    composer.chosen = false;
    if (editing) { editing = null; renderPanel(); }
    renderComposer();
    if (!s) return;
    const showRolls = Storage.settings().showRolls;
    for (const c of s.chronicle) d.feed.append(el('div', { class: 'f-chronicle' }, el('p', null, c.summary)));
    let prev = null;
    for (const e of s.log) {
      const key = `${e.day}|${e.phase}`;
      if (key !== prev) d.feed.append(dividerNode(e.day, e.phase));
      prev = key;
      if (e.input) d.feed.append(inputNode(e.input, e));
      if (e.roll && e.roll.line && showRolls) d.feed.append(rollNode(e.roll));
      if (e.narration) d.feed.append(narrationNode(e.narration, e.mock === true));
    }
    if (prev !== `${s.time.day}|${s.time.phase}`) d.feed.append(dividerNode(s.time.day, s.time.phase));
    scrollToBottom();
  }

  // ----- composer and autocomplete -----
  function autosize() {
    const ta = d.cmd;
    ta.style.height = 'auto';
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || 24;
    const borders = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const max = lh * 4 + pad + borders;
    const want = ta.scrollHeight + borders;
    ta.style.height = Math.min(want, max) + 'px';
    ta.style.overflowY = want > max + 1 ? 'auto' : 'hidden';
  }
  /* While a turn or arrival is running, nothing may load or start a game
     (App refuses those too): New game, Continue, Load and Import are off.
     The composer has three states (data-turn on .composer; UI.turnPhase):
     'busy' (setBusy(true): from the start of a turn to the end of its
     narration), 'closing' (setBusy('closing'): Pipeline.runTurn once the
     narration is in, while the bookkeeper and any chronicle finish) and
     'idle'. Closing counts as busy for everything above, and Send (Wait
     when the box is empty), Enter and the commands stay refused, so
     nothing is sent, loaded or undone until the turn closes. The box itself
     takes typing in every state (it never did lock: only Send did), and
     closing hands it back: on a laptop the focus returns to it unless the
     player has put it somewhere else, so the next line can be written
     while the turn closes; it is kept when the turn closes, and Send comes
     back. */
  function setBusy(b) {
    const was = turnPhase;
    turnPhase = b === 'closing' ? 'closing' : b ? 'busy' : 'idle';
    busy = turnPhase !== 'idle';
    if (d.composer) d.composer.dataset.turn = turnPhase;
    d.send.disabled = busy;
    syncSendLabel();
    if (turnPhase === 'closing' && was === 'busy' && screen === 'game' && !isMobile()) {
      const at = document.activeElement;
      if (!at || at === document.body || at === d.send) d.cmd.focus({ preventScroll: true });
    }
    d.feed.setAttribute('aria-busy', String(busy));
    d.btnNew.disabled = busy;
    d.btnLoad.disabled = busy;
    d.btnImport.disabled = busy;
    if (screen === 'title') d.btnContinue.disabled = busy || !Storage.hasAutosave();
    d.btnUpdate.disabled = busy;
    d.setReread.disabled = busy || !gameLoaded();
    // Switching mock mode off mid-turn would hand the turn's later calls to the other provider.
    d.narratorBannerGo.disabled = busy && d.narratorBanner.dataset.kind === 'mock';
    $$('[data-action="load"]', d.slotList).forEach(btn => { btn.disabled = busy || btn.dataset.filled !== '1'; });
    $$('[data-action="update"]', d.slotList).forEach(btn => { btn.disabled = busy; });
    // A turn has started: a "Go to" chip on the map goes away.
    if (busy && mapPick) setPick(null);
    // People: no edit starts or saves while a turn runs.
    $$('.pcard-edit, .pedit-save', d.panelBody).forEach(btn => { btn.disabled = busy; if (busy) btn.title = App.BUSY_NOTICE; else btn.removeAttribute('title'); });
  }
  /* With nothing typed, Send reads Wait and runs a beat (Pipeline.pass). While a turn runs its title says why it is off. */
  function syncSendLabel() {
    const empty = !d.cmd.value.trim();
    d.send.textContent = empty ? 'Wait' : 'Send';
    d.send.title = turnPhase === 'closing' ? 'Finishing the turn: you can type your next move' : busy ? 'Wait for the turn to finish' : empty ? 'Say nothing and see what they do' : 'Send';
  }
  async function send() {
    const text = d.cmd.value;
    if (busy) return;
    if (!text.trim()) {
      if (screen !== 'game' || !State.current) return;
      hideAc();
      try { await Pipeline.pass(); } catch (e) { console.error(e); }
      syncSendLabel();
      if (!isMobile()) d.cmd.focus({ preventScroll: true });
      return;
    }
    hideAc();
    d.cmd.value = '';
    autosize();
    syncAddressee();
    let res = null;
    try { res = await Pipeline.submit(text, { mode: composer.mode, to: composer.to }); } catch (e) { console.error(e); res = { restoreInput: true }; }
    // A failed turn puts its text back. A next line typed while it ran (the box takes typing throughout) stays too, after it.
    if (res && res.restoreInput) {
      const typed = d.cmd.value;
      if (!typed.trim()) d.cmd.value = text;
      else if (typed.trim() !== text.trim()) d.cmd.value = `${text}\n${typed}`;
      autosize();
    }
    syncSendLabel();
    // A command that put the focus somewhere on purpose (/edit: the editor's name field) keeps it there.
    if (!isMobile() && screen === 'game' && !(res && res.keepFocus)) d.cmd.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!d.ac.hidden && ac.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveAc(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveAc(-1); return; }
      if (e.key === 'Tab') { e.preventDefault(); completeAc(ac.index >= 0 ? ac.index : 0); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideAc(); return; }
      if (e.key === 'Enter' && !e.shiftKey && ac.index >= 0) { e.preventDefault(); completeAc(ac.index); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  }
  function updateAc() {
    const v = d.cmd.value;
    if (!/^\/\S*$/.test(v)) { hideAc(); return; }
    const items = Commands.match(v);
    if (!items.length) { hideAc(); return; }
    ac.items = items;
    ac.index = -1;
    renderAc();
  }
  function renderAc() {
    d.ac.replaceChildren(...ac.items.map((c, i) => el('li', {
      role: 'option', id: 'ac-' + i, 'aria-selected': String(i === ac.index), dataset: { cmd: c.name },
      onmousedown: e => { e.preventDefault(); completeAc(i); }
    }, el('span', { class: 'ac-name' }, c.name), c.args ? el('span', { class: 'ac-args' }, c.args) : null, el('span', { class: 'ac-desc' }, c.desc))));
    d.ac.hidden = false;
    d.cmd.setAttribute('aria-expanded', 'true');
    if (ac.index >= 0) d.cmd.setAttribute('aria-activedescendant', 'ac-' + ac.index); else d.cmd.removeAttribute('aria-activedescendant');
  }
  function moveAc(step) {
    const n = ac.items.length;
    ac.index = ac.index < 0 ? (step > 0 ? 0 : n - 1) : (ac.index + step + n) % n;
    renderAc();
    const li = d.ac.children[ac.index];
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
  function completeAc(i) {
    const c = ac.items[i];
    if (!c) return;
    d.cmd.value = c.name + (c.args ? ' ' : '');
    hideAc();
    autosize();
    d.cmd.focus();
  }
  function hideAc() {
    ac.items = [];
    ac.index = -1;
    if (d.ac) { d.ac.hidden = true; d.ac.replaceChildren(); }
    if (d.cmd) { d.cmd.setAttribute('aria-expanded', 'false'); d.cmd.removeAttribute('aria-activedescendant'); }
  }

  // ----- Do / Say -----
  function focusInput() { if (!isMobile() && screen === 'game') d.cmd.focus({ preventScroll: true }); }
  function presentNow() { const s = State.current; return s && !State.muted ? State.npcsAt(s.player.locationId) : []; }
  /* Say mode's addressee: the one the player picked, while they stay in the
     same place and that person is still here; otherwise the default (the
     only person here, else everyone). Returns who is present. */
  function syncAddressee() {
    const s = State.current;
    const loc = s && !State.muted ? s.player.locationId : null;
    const present = presentNow();
    if (loc !== composer.sceneLoc) { composer.sceneLoc = loc; composer.chosen = false; }
    if (composer.to !== 'everyone' && !present.some(n => n.id === composer.to)) composer.chosen = false;
    if (!composer.chosen) composer.to = Pipeline.defaultAddressee(present);
    return present;
  }
  function addresseeName(present) {
    const n = composer.to === 'everyone' ? null : present.find(x => x.id === composer.to);
    return n ? npcLabel(n) : 'everyone';
  }
  /* The toggle, the chips (Say mode only: Everyone plus each person here,
     exactly one pressed) and the placeholder. Runs on every render, so the
     chips follow the scene: after each turn, a move, a load. */
  function renderComposer() {
    if (!d.cmd) return;
    const present = syncAddressee();
    const say = composer.mode === 'say';
    d.modeDo.setAttribute('aria-pressed', String(!say));
    d.modeSay.setAttribute('aria-pressed', String(say));
    d.sayTo.hidden = !say;
    const key = say ? ['everyone'].concat(present.map(n => n.id + ':' + npcLabel(n))).join('|') + '>' + composer.to : '';
    if (key !== composer.rendered) {
      composer.rendered = key;
      const chip = (id, label) => el('button', { type: 'button', class: 'say-chip', 'aria-pressed': String(composer.to === id), dataset: { to: id }, title: label }, label);
      d.sayTo.replaceChildren(...(say ? [chip('everyone', 'Everyone')].concat(present.map(n => chip(n.id, npcLabel(n)))) : []));
    }
    const who = addresseeName(present);
    d.cmd.placeholder = say ? (isMobile() ? 'What do you say?' : `What do you say to ${who}?`) : (isMobile() ? 'What do you do?' : 'What do you do? (/ for commands)');
    d.cmd.setAttribute('aria-label', say ? `What you say to ${who}` : 'Your action');
  }
  /* Game.UI.setMode('do' | 'say') and Game.UI.setAddressee(id | 'everyone'):
     the same as pressing the toggle or a chip. */
  function setMode(m) {
    composer.mode = m === 'say' ? 'say' : 'do';
    if (Storage.settings().inputMode !== composer.mode) Storage.saveSettings({ inputMode: composer.mode });
    renderComposer();
    return composer.mode;
  }
  function setAddressee(id) {
    const present = presentNow();
    if (id !== 'everyone' && !present.some(n => n.id === id)) return false;
    syncAddressee();
    composer.to = id;
    composer.chosen = true;
    renderComposer();
    return true;
  }

  // ----- settings screen -----
  function fillSettings() {
    const s = Storage.settings();
    d.setKey.value = Storage.getApiKey();
    d.setRemember.checked = s.rememberKey;
    d.setMock.checked = s.mockMode;
    d.setNarratorModel.value = s.narratorModel;
    d.setParserModel.value = s.parserModel;
    d.setBookkeeperModel.value = s.bookkeeperModel;
    $$('[data-effort]').forEach(sel => { sel.value = s.effort[sel.dataset.effort]; });
    d.setRolls.checked = s.showRolls;
    d.setPermadeath.checked = s.permadeath;
    const theme = Storage.effectiveTheme();
    $$('input[name="set-theme"]').forEach(r => { r.checked = r.value === theme; });
    $$('input[name="set-size"]').forEach(r => { r.checked = r.value === s.textSize; });
    $$('input[name="set-style"]').forEach(r => { r.checked = r.value === s.narrationStyle; });
    d.settingsQuit.hidden = !App.inGame();
    const loaded = gameLoaded();
    d.setReread.disabled = busy || !loaded;
    d.setRereadNone.hidden = loaded;
    d.setRereadBehind.hidden = !(loaded && Upgrade.behind(State.current));
  }
  function gameLoaded() { return App.inGame() && !!State.current && !State.muted; }
  function onSettingsChange(e) {
    const t = e.target;
    if (t === d.setKey || t === d.setRemember) { Storage.setApiKey(d.setKey.value, d.setRemember.checked); return; }
    if (t.name === 'set-theme') { Storage.saveSettings({ theme: t.value }); applyDisplay(); return; }
    if (t.name === 'set-size') { Storage.saveSettings({ textSize: t.value }); applyDisplay(); return; }
    if (t.name === 'set-style') { Storage.saveSettings({ narrationStyle: t.value }); return; }
    const before = Storage.settings();
    const effort = {};
    $$('[data-effort]').forEach(sel => { effort[sel.dataset.effort] = sel.value; });
    const after = Storage.saveSettings({
      mockMode: d.setMock.checked,
      narratorModel: d.setNarratorModel.value.trim() || Storage.DEFAULTS.narratorModel,
      parserModel: d.setParserModel.value.trim() || Storage.DEFAULTS.parserModel,
      bookkeeperModel: d.setBookkeeperModel.value.trim() || Storage.DEFAULTS.bookkeeperModel,
      effort,
      showRolls: d.setRolls.checked,
      permadeath: d.setPermadeath.checked
    });
    if (before.showRolls !== after.showRolls && State.current && !State.muted) rebuildFeed();
  }

  // ----- saves screen -----
  function slotMeta(env) {
    const s = env.summary || {};
    const when = env.savedAt ? new Date(env.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return `${s.player || '?'} · Day ${s.day} ${capFirst(s.phase || '')} · ${s.location || ''}${when ? ' · ' + when : ''}`;
  }
  /* A save made under older rules (Upgrade): it loads and plays as it is; Update brings it up to date. */
  const saveBehind = env => !!env && !env.broken && Upgrade.behind(env.state);
  function slotRow(label, env, actions, id) {
    return el('div', { class: 'slot', id },
      el('div', { class: 'slot-info' },
        el('span', { class: 'slot-name' }, label),
        el('span', { class: 'slot-meta' }, env && !env.broken ? slotMeta(env) : env && env.broken ? 'Damaged save' : 'Empty'),
        saveBehind(env) ? el('span', { class: 'slot-note' }, 'Saved under older rules') : null),
      el('div', { class: 'slot-actions' }, actions));
  }
  function renderSaves() {
    const inGame = App.inGame() && State.current && !State.muted;
    d.savesError.textContent = '';
    d.saveNameField.hidden = !inGame;
    if (inGame && !d.saveName.value) d.saveName.value = `${State.current.player.name}, day ${State.current.time.day}`;
    d.btnExport.disabled = !inGame;
    d.btnImport.disabled = busy;
    const loadBtn = (filled, onclick) => el('button', { type: 'button', class: 'btn small', 'data-action': 'load', dataset: { filled: filled ? '1' : '' }, disabled: busy || !filled, onclick }, 'Load');
    const updateBtn = (env, onclick) => (saveBehind(env) ? el('button', { type: 'button', class: 'btn small', 'data-action': 'update', disabled: busy, onclick, title: 'Load this game and update it to the latest rules' }, 'Update') : null);
    const rows = [];
    const auto = Storage.peek(Storage.KEYS.autosave);
    rows.push(slotRow('Autosave', auto, [loadBtn(!!auto && !auto.broken, () => App.continueGame()), updateBtn(auto, () => App.updateSave('autosave'))], 'slot-auto'));
    Storage.listSlots().forEach((env, i) => {
      const n = i + 1;
      const filled = env && !env.broken;
      const del = el('button', { type: 'button', class: 'btn small danger', 'data-action': 'delete', hidden: !env }, 'Delete');
      del.addEventListener('click', () => {
        if (del.dataset.armed) { Storage.deleteSlot(n); renderSaves(); toast(`Slot ${n} cleared.`); return; }
        del.dataset.armed = '1';
        del.textContent = 'Confirm delete';
        setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Delete'; } }, 3000);
      });
      rows.push(slotRow(filled ? env.name : `Slot ${n}`, env, [
        inGame ? el('button', { type: 'button', class: 'btn small', 'data-action': 'save', onclick: () => {
          const env2 = Storage.saveSlot(n, d.saveName.value);
          if (env2) { toast(`Saved to slot ${n}.`); d.saveName.value = ''; renderSaves(); }
        } }, filled ? 'Overwrite' : 'Save here') : null,
        loadBtn(filled, () => App.loadSlot(n)),
        updateBtn(env, () => App.updateSave(n)),
        del
      ], 'slot-' + n));
    });
    d.slotList.replaceChildren(...rows);
  }
  async function onImport() {
    const file = d.importFile.files && d.importFile.files[0];
    d.importFile.value = '';
    if (!file) return;
    try {
      const env = await Storage.importFile(file);
      if (App.enter(env)) toast('Imported.');
    } catch (e) {
      d.savesError.textContent = e.message;
    }
  }

  // ----- character creation -----
  /* One page on laptop, one step per screen on mobile (CSS shows only
     .step.current below 900px; the Next/Back buttons drive it). */
  const Create = (() => {
    const STEPS = [
      { id: 'name', title: 'Name', sub: 'What people in town will call you.' },
      { id: 'background', title: 'Background and age', sub: 'Sets your starting stats, money, two items, and whether you arrive by road or river. Your age starts at what the background suggests.' },
      { id: 'stats', title: 'Stats', sub: 'You may move one point from one stat to another.' },
      { id: 'goal', title: 'Goal', sub: 'One line: why you came to this town.' },
      { id: 'flaw', title: 'Flaw', sub: 'Pick one, or write your own.' },
      { id: 'loose', title: 'Three loose ends', sub: 'Pick three. Each becomes a real person in town, with consequences.' }
    ];
    let draft = null;
    let step = 0;
    const sections = {};

    function blank() {
      const loose = {};
      for (const k of LOOSE_END_KINDS) if (LOOSE_ENDS[k]) loose[k] = { on: false, option: 0, text: LOOSE_ENDS[k].options[0] || '' };
      return { name: '', age: '', ageTouched: false, backgroundId: null, moveFrom: '', moveTo: '', goal: '', flawIndex: -1, flawCustom: '', loose };
    }
    function bg() { return BACKGROUNDS.find(b => b.id === draft.backgroundId) || null; }
    function finalStats() {
      const b = bg();
      if (!b) return null;
      const s = Object.assign({}, b.stats);
      if (draft.moveFrom && draft.moveTo && draft.moveFrom !== draft.moveTo && s[draft.moveFrom] > -1 && s[draft.moveTo] < 3) { s[draft.moveFrom] -= 1; s[draft.moveTo] += 1; }
      return s;
    }
    function flawText() { return cleanText(draft.flawCustom, 120) || (draft.flawIndex >= 0 ? FLAWS[draft.flawIndex] : ''); }
    function chosenLoose() {
      return LOOSE_END_KINDS.filter(k => draft.loose[k] && draft.loose[k].on).map(k => ({ kind: k, text: cleanText(draft.loose[k].text, 200) }));
    }
    /* The age as typed, else the background's: a number, or the text for the engine to refuse. */
    function ageValue() {
      const t = String(draft.age || '').trim();
      if (!t) { const b = bg(); return b && Number.isInteger(b.age) ? b.age : undefined; }
      return /^\d+$/.test(t) ? Number(t) : t;
    }
    function ageError() {
      const a = ageValue();
      return a === undefined || (Number.isInteger(a) && a >= State.AGE_MIN && a <= State.AGE_MAX) ? '' : `Age must be a whole number from ${State.AGE_MIN} to ${State.AGE_MAX}.`;
    }
    function character() {
      return { name: cleanText(draft.name, 40), age: ageValue(), backgroundId: draft.backgroundId, stats: finalStats(), goal: cleanText(draft.goal, 140), flaw: flawText(), looseEnds: chosenLoose() };
    }
    function statLine(st) { return STATS.map(k => `${capFirst(k)} ${fmtMod(st[k])}`).join(', '); }
    function focusSel(sel) { const n = $(sel, d.createSteps); if (n) n.focus({ preventScroll: true }); }

    function wire() {
      d.crCancel.addEventListener('click', quit);
      d.crBack.addEventListener('click', backStep);
      d.crNext.addEventListener('click', nextStep);
      d.crReview.addEventListener('click', review);
      d.crEdit.addEventListener('click', () => { App.cancelPrepare(); showForm(); });
      d.crBegin.addEventListener('click', () => App.begin());
    }
    function start() {
      draft = blank();
      step = 0;
      d.createSteps.replaceChildren();
      STEPS.forEach((st, i) => {
        const sec = el('section', { class: 'step', id: 'cr-step-' + st.id, 'aria-labelledby': 'cr-h-' + st.id, dataset: { step: String(i) } });
        sections[st.id] = sec;
        d.createSteps.append(sec);
        renderStep(st.id);
      });
      showForm();
    }
    function quit() { App.cancelPrepare(); showScreen('title'); }
    function showForm() {
      d.createSummaryView.hidden = true;
      d.createFormView.hidden = false;
      updateSteps();
      d.createScroll.scrollTop = 0;
    }
    function layoutChanged() { if (draft) updateSteps(); }
    function updateSteps() {
      STEPS.forEach((st, i) => sections[st.id] && sections[st.id].classList.toggle('current', i === step));
      d.crCount.textContent = `Step ${step + 1} of ${STEPS.length}`;
      d.crNext.textContent = step === STEPS.length - 1 ? 'Review' : 'Next';
      d.crBack.textContent = step === 0 ? 'Title' : 'Back';
    }
    function nextStep() {
      const id = STEPS[step].id;
      const err = stepError(id);
      showErr(id, err);
      if (err) return;
      if (step < STEPS.length - 1) {
        step += 1;
        updateSteps();
        d.createScroll.scrollTop = 0;
        const first = $('input, button.choice, button.chip, select', sections[STEPS[step].id]);
        if (first) first.focus({ preventScroll: true });
      } else review();
    }
    function backStep() {
      if (step > 0) { step -= 1; updateSteps(); d.createScroll.scrollTop = 0; } else quit();
    }
    function stepError(id) {
      switch (id) {
        case 'name': return cleanText(draft.name, 40) ? '' : 'Give your character a name.';
        case 'background': return bg() ? ageError() : 'Pick a background.';
        case 'goal': return cleanText(draft.goal, 140) ? '' : 'Write one line about why you came here.';
        case 'flaw': return flawText() ? '' : 'Pick a flaw or write your own.';
        case 'loose': {
          const ch = chosenLoose();
          if (ch.length !== 3) return `Choose exactly three loose ends (${ch.length} chosen).`;
          if (ch.some(x => !x.text)) return 'Each loose end needs a line of text.';
          return '';
        }
        default: return '';
      }
    }
    function showErr(id, msg) { const e = $('.err', sections[id]); if (e) e.textContent = msg || ''; }
    function review() {
      let firstBad = -1;
      STEPS.forEach((st, i) => { const err = stepError(st.id); showErr(st.id, err); if (err && firstBad < 0) firstBad = i; });
      if (firstBad >= 0) {
        step = firstBad;
        updateSteps();
        sections[STEPS[firstBad].id].scrollIntoView({ block: 'start' });
        return false;
      }
      try {
        if (!App.prepare(character())) return false; // a turn is still running
      } catch (e) {
        showErr('loose', 'Could not create the character: ' + e.message);
        return false;
      }
      renderSummary();
      d.createFormView.hidden = true;
      d.createSummaryView.hidden = false;
      d.createScroll.scrollTop = 0;
      d.crBegin.focus({ preventScroll: true });
      return true;
    }
    function renderSummary() {
      const s = State.current;
      const p = s.player;
      const l = State.loc(p.locationId);
      const b = BACKGROUNDS.find(x => x.id === p.backgroundId);
      const row = (k, v) => [el('dt', null, k), el('dd', null, v)];
      d.summaryCard.replaceChildren(
        el('h2', null, p.name, ageText(p.age) ? el('span', { class: 'char-age' }, ` · ${p.age}`) : null),
        el('p', { class: 'muted' }, `${p.background} · ${b ? b.blurb : ''}`),
        el('dl', null,
          row('Age', ageText(p.age) || '—'),
          row('Stats', statLine(p.stats)),
          row('HP', `${p.hp} / ${p.maxHp}`),
          row(moneyLabel(), currency() ? money(p.gold) : String(p.gold)),
          row('Carrying', p.inventory.map(i => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(', ')),
          row('Goal', p.goal),
          row('Flaw', p.flaw),
          row('Arrives', `${b && b.arrival === 'docks' ? 'By river' : 'By road'}, at ${l.name}`),
          row('Story points', String(p.storyPoints))),
        el('h3', null, 'Loose ends'),
        el('ul', { id: 'summary-loose' }, p.looseEnds.map(le => {
          const n = State.npc(le.npcId);
          return el('li', { dataset: { kind: le.kind, npc: le.npcId } },
            el('strong', null, `${le.label}: `), `${le.text} `,
            el('span', { class: 'muted' }, `${le.created ? 'New in town' : 'Linked to'}: ${n.name}, ${n.role}.`));
        })));
    }
    function stepHead(st) {
      return [el('h2', { class: 'step-title', id: 'cr-h-' + st.id }, st.title), el('p', { class: 'step-sub' }, st.sub)];
    }
    function renderStep(id) {
      const st = STEPS.find(x => x.id === id);
      const sec = sections[id];
      const body = BODIES[id]();
      sec.replaceChildren(...stepHead(st), ...[].concat(body), el('p', { class: 'err', role: 'alert' }));
    }
    const BODIES = {
      name() {
        return [
          el('label', { class: 'visually-hidden', for: 'cr-name' }, 'Name'),
          el('input', { class: 'input', id: 'cr-name', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: 'Your name', value: draft.name,
            oninput: e => { draft.name = e.target.value; showErr('name', ''); },
            onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); if (isMobile()) nextStep(); } } })
        ];
      },
      background() {
        const chosen = bg();
        const age = el('div', { class: 'field cr-age-field' },
          el('label', { class: 'label', for: 'cr-age' }, 'Age'),
          el('input', { class: 'input', id: 'cr-age', type: 'number', inputmode: 'numeric', min: String(State.AGE_MIN), max: String(State.AGE_MAX), step: '1', autocomplete: 'off',
            value: draft.age, placeholder: chosen && Number.isInteger(chosen.age) ? String(chosen.age) : 'Pick a background first',
            oninput: e => { draft.age = e.target.value; draft.ageTouched = String(e.target.value).trim() !== ''; showErr('background', ''); },
            onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); if (isMobile()) nextStep(); } } }),
          el('p', { class: 'hint' }, `${State.AGE_MIN} to ${State.AGE_MAX}.${chosen && Number.isInteger(chosen.age) ? ` A ${chosen.name.toLowerCase()} is usually about ${chosen.age}.` : ''}`));
        return [el('div', { class: 'choice-grid', role: 'group', 'aria-label': 'Backgrounds' }, BACKGROUNDS.map(b => el('button', {
          type: 'button', class: 'choice bg-choice', 'aria-pressed': String(draft.backgroundId === b.id), dataset: { id: b.id },
          onclick: () => {
            draft.backgroundId = b.id;
            draft.moveFrom = '';
            draft.moveTo = '';
            // The background's age, unless the player has typed their own.
            if (!draft.ageTouched) draft.age = Number.isInteger(b.age) ? String(b.age) : '';
            renderStep('background');
            renderStep('stats');
            focusSel(`.bg-choice[data-id="${b.id}"]`);
          }
        },
        el('span', { class: 'choice-title' }, b.name),
        el('span', { class: 'choice-sub' }, b.blurb),
        el('span', { class: 'choice-meta' }, `${Number.isInteger(b.age) ? `age ${b.age} · ` : ''}${statLine(b.stats)} · ${money(b.gold)} · ${b.items.map(i => i.name).join(', ')} · arrives by ${b.arrival === 'docks' ? 'river' : 'road'}`)))), age];
      },
      stats() {
        const b = bg();
        if (!b) return el('p', { class: 'muted' }, 'Pick a background first. It sets your starting stats.');
        const fin = finalStats();
        const grid = el('div', { class: 'stat-grid', id: 'cr-stat-grid' }, STATS.map(k => el('div', { class: 'stat' + (fin[k] !== b.stats[k] ? ' changed' : '') },
          el('span', { class: 'stat-name' }, capFirst(k)), el('span', { class: 'stat-val', dataset: { stat: k } }, fmtMod(fin[k])))));
        const from = el('select', { class: 'input', id: 'cr-move-from', onchange: e => {
          draft.moveFrom = e.target.value;
          if (draft.moveFrom && draft.moveFrom === draft.moveTo) draft.moveTo = '';
          renderStep('stats');
          focusSel('#cr-move-from');
        } }, el('option', { value: '' }, 'No change'), STATS.map(k => el('option', { value: k, disabled: b.stats[k] <= -1 }, `${capFirst(k)} (${fmtMod(b.stats[k])})`)));
        from.value = draft.moveFrom;
        const to = el('select', { class: 'input', id: 'cr-move-to', onchange: e => { draft.moveTo = e.target.value; renderStep('stats'); focusSel('#cr-move-to'); } },
          el('option', { value: '' }, 'No change'), STATS.map(k => el('option', { value: k, disabled: b.stats[k] >= 3 || k === draft.moveFrom }, `${capFirst(k)} (${fmtMod(b.stats[k])})`)));
        to.value = draft.moveTo;
        return [grid,
          el('div', { class: 'move-row' },
            el('div', null, el('label', { class: 'label', for: 'cr-move-from' }, 'Take one point from'), from),
            el('div', null, el('label', { class: 'label', for: 'cr-move-to' }, 'Give it to'), to)),
          el('p', { class: 'hint' }, 'Optional. Pick both to move a point. Stats run from −1 to +3.')];
      },
      goal() {
        return [
          el('label', { class: 'visually-hidden', for: 'cr-goal' }, 'Goal'),
          el('input', { class: 'input', id: 'cr-goal', type: 'text', maxlength: '140', autocomplete: 'off', placeholder: 'Find out what happened to my brother', value: draft.goal,
            oninput: e => { draft.goal = e.target.value; showErr('goal', ''); },
            onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); if (isMobile()) nextStep(); } } })
        ];
      },
      flaw() {
        const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Flaws' }, FLAWS.map((f, i) => el('button', {
          type: 'button', class: 'chip flaw-choice', 'aria-pressed': String(draft.flawIndex === i && !cleanText(draft.flawCustom)), dataset: { index: String(i) },
          onclick: () => { draft.flawIndex = i; draft.flawCustom = ''; renderStep('flaw'); focusSel(`.flaw-choice[data-index="${i}"]`); }
        }, f)));
        const custom = el('input', { class: 'input', id: 'cr-flaw-custom', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'Or write your own', value: draft.flawCustom,
          'aria-label': 'Your own flaw',
          oninput: e => {
            draft.flawCustom = e.target.value;
            if (cleanText(draft.flawCustom)) draft.flawIndex = -1;
            $$('.flaw-choice', sections.flaw).forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.index === draft.flawIndex && !cleanText(draft.flawCustom))));
            showErr('flaw', '');
          } });
        return [chips, el('div', { style: 'margin-top:12px' }, custom)];
      },
      loose() {
        const chosen = chosenLoose();
        const items = LOOSE_END_KINDS.filter(k => LOOSE_ENDS[k]).map(k => {
          const def = LOOSE_ENDS[k];
          const st = draft.loose[k];
          const toggle = el('button', {
            type: 'button', class: 'chip le-toggle', 'aria-pressed': String(st.on), disabled: !st.on && chosen.length >= 3, dataset: { kind: k },
            onclick: () => { st.on = !st.on; renderStep('loose'); focusSel(`.le-toggle[data-kind="${k}"]`); }
          }, def.label);
          let inner = null;
          if (st.on) {
            const txt = el('input', { class: 'input le-text', type: 'text', maxlength: '200', autocomplete: 'off', value: st.text, dataset: { kind: k },
              'aria-label': `${def.label}, in your words`, oninput: e => { st.text = e.target.value; } });
            const sel = el('select', { class: 'input le-option', dataset: { kind: k }, 'aria-label': `${def.label}: pick one`,
              onchange: e => { st.option = +e.target.value; st.text = def.options[st.option]; txt.value = st.text; } },
            def.options.map((o, i) => el('option', { value: String(i) }, o)));
            sel.value = String(st.option);
            inner = el('div', { class: 'le-body' }, sel, txt, el('p', { class: 'hint' }, 'Edit the line if you like.'));
          }
          return el('div', { class: 'le-item' + (st.on ? ' on' : ''), dataset: { kind: k } }, toggle, inner);
        });
        return [el('p', { class: 'step-count', id: 'cr-le-count' }, `${chosen.length} of 3 chosen.`), el('div', { style: 'margin-top:10px' }, items)];
      }
    };
    return { wire, start, review, layoutChanged, get draft() { return draft; }, STEPS };
  })();

  return {
    init, showScreen, back, renderGame, renderPanel, rebuildFeed, openPanel, closeSheet, setCollapsed, toggleDebug,
    toggleTheme, applyDisplay, warn, toast, setBusy, feed, Create, scrollToBottom,
    narratorState, renderNarratorBanner, openKeySettings, NARRATOR_NOTES,
    setMode, setAddressee, renderComposer, togglePerson, togglePlace, workText, renderMap, mapLayout,
    editPerson: editPersonFromCommand, saveEdit, cancelEdit,
    get openPerson() { return openPerson; },
    get openPlace() { return openPlace; },
    get editing() { return editing ? editing.id : null; },
    get mapPick() { return mapPick; },
    get mode() { return composer.mode; },
    get addressee() { syncAddressee(); return composer.to; },
    get screen() { return screen; },
    get tab() { return tab; },
    get debug() { return debugOn; },
    get stuckToBottom() { return stick; },
    get turnPhase() { return turnPhase; }
  };
})();

