// ===== Module: UI =====
/* All rendering. Every dynamic string goes in through el()/textContent.
   Wave 45 (accessibility): a skip link to the story, a hidden "Turn N"
   heading on each narration, the status line's polite live region
   (#turn-status-live), and the focus kept when the feed is drawn again.
   Wave 44: the key card's steps, Settings "This device" (Forget key,
   Delete all game data), no Continue with nothing to continue, and the
   first-turn tip's suggestions from the opening scene (openingTries), one
   "Tips" line on a phone on its side with the keyboard up.
   Wave 43: the top bar's day in the arc ("Day 3 of 21", a phone "/21";
   renderArc) and the next town event; the cost chip (renderCost, Api.onSpend)
   that opens Settings at Spending; Spending's lines, projection and the
   "Pause and ask at $X" ceiling (spendNotice once, spendGate before the
   next paid turn). */
const UI = (() => {
  const d = {};
  const TABS = [['character', 'Character'], ['people', 'People'], ['journal', 'Journal'], ['objectives', 'Objectives'], ['places', 'Places']];
  // The shorter labels a narrow tab row falls back to (fitTabs): "Goals" first, then "You".
  const TAB_SHORT = { objectives: 'Goals', character: 'You' };
  const mq = window.matchMedia('(max-width: 899px)');
  const isMobile = () => mq.matches;
  // A phone on its side: with the keyboard up the story has a strip about 200px tall, so the top bar steps aside too and Say is the picker in the input row (compactComposer).
  const landMq = window.matchMedia('(orientation: landscape)');
  let screen = 'title';
  let returnTo = 'title';
  let tab = 'character';
  let debugOn = false;
  let stick = true;
  let busy = false;
  let toastTimer = null;
  const ac = { items: [], index: -1 };
  const pendingWarnings = [];
  /* The composer's Do / Say toggle. mode persists per browser
     (settings.inputMode). to is who Say mode speaks to; it is never saved,
     and lasts only while the player stays in the same place (sceneLoc) and
     that person is still here. chosen: the player picked it on a chip. */
  const composer = { mode: 'do', to: 'everyone', chosen: false, sceneLoc: null, rendered: '' };
  /* People tab: the id of the one open person card (memory only), what the
     search box holds and how the Known group is sorted. */
  let openPerson = null;
  let peopleQuery = '';
  let peopleSort = 'seen';
  /* Quiet lines (UI.feed.quiet) not yet stored on a log entry: App puts
     them on the newest entry as notes when the turn commits (pendingNotes,
     the texts; pendingNodes, their feed lines, so a turn taken back out of
     the feed takes its notes with it). */
  const pendingNotes = [];
  const pendingNodes = [];
  /* Where in its turn a quiet line was printed (wave 6, the round-5
     playtest's R7), so the feed rebuilt after /undo or a reload shows it
     where it was: open, a turn's input is in the feed and the turn has not
     ended (UI.setBusy(false)); roll and narr, its roll and its narration
     have been shown. */
  const turnMark = { open: false, roll: false, narr: false };
  /* The turn status line: the stage the Pipeline last reported (or the
     feed implied), whether the Pipeline reports stages itself, and whether
     a line is waiting in the Pipeline's queue. */
  const status = { stage: 'idle', fromPipeline: false, queued: false, queuedText: '' };
  /* The last thing sent from the box ({ text, mode, to } or { pass: true }), for a failed turn's Try again. */
  let lastSent = null;
  /* The feed's scroll when the game screen was left for Settings or Saves. */
  let feedPlace = null;
  /* The offline-demo bar was closed for this page load. */
  let demoBarHidden = false;
  /* Turns played (with a call to the API) since the page loaded. */
  let sessionTurns = 0;
  /* The element that opened the phone sheet, the menu or the actions list, to take the focus back to. */
  let sheetOpener = null;

  function camel(id) { return id.replace(/-([a-z])/g, (m, c) => c.toUpperCase()); }
  const IDS = ['app', 'banner', 'banner-text', 'banner-close', 'title-name', 'title-tagline', 'title-setting', 'title-setting-more', 'title-more', 'btn-new', 'btn-continue', 'btn-load',
    'btn-settings', 'btn-theme', 'title-mode', 'title-mode-text', 'title-mode-act', 'continue-sub', 'title-broken', 'title-broken-text', 'btn-broken-download',
    'create-scroll', 'create-form-view', 'create-summary-view', 'create-mode-view', 'create-steps', 'cr-count', 'cr-random', 'summary-title', 'create-title', 'mode-title',
    'choose-claude', 'choose-demo', 'mode-key', 'mode-key-input', 'mode-remember', 'mode-key-err', 'mode-key-go', 'mode-cancel',
    'cr-cancel', 'cr-back', 'cr-next', 'cr-review', 'cr-edit', 'cr-begin', 'summary-card', 'tb-wd', 'tb-time', 'tb-loc', 'tb-hp', 'tb-gold', 'tb-gold-unit',
    'tb-save', 'tb-settings', 'tb-panel', 'tb-menu', 'menu-pop', 'game-body', 'feed-scroll', 'feed', 'feed-after', 'new-btn', 'ac', 'cmd', 'send', 'game-title',
    'demo-bar', 'demo-bar-text', 'demo-bar-act', 'demo-bar-close', 'tab-bar', 'tab-bar-take', 'turn-status', 'turn-status-text', 'queued-note', 'act-btn', 'act-pop',
    'panel', 'panel-tabs', 'panel-close', 'panel-body', 'settings-form', 'set-key', 'set-remember', 'set-mock', 'set-keep-packets', 'set-narrator-model',
    'set-parser-model', 'set-rolls', 'set-permadeath', 'settings-done', 'settings-quit', 'save-name-field', 'save-name', 'slot-list',
    'set-check-key', 'key-status', 'session-line', 'preset-custom', 'set-advanced', 'settings-title', 'saves-title', 'last-export',
    'btn-export', 'btn-import', 'import-file', 'saves-error', 'saves-done', 'toast', 'say-to', 'mode-do', 'mode-say',
    'btn-update', 'title-update-note', 'set-reread', 'set-reread-none', 'set-reread-behind', 'set-reread-memories', 'ask', 'ask-title', 'ask-text', 'ask-yes', 'ask-no',
    'menu-list', 'continue-group', 'title-newer-note', 'act-btn-m', 'queued-text', 'queued-cancel', 'tab-bar-text', 'cr-errsum', 'undo-row', 'undo-btn', 'title-build', 'set-build',
    'skip-link', 'turn-status-live',
    // Wave 43: the next town event and the cost chip in the top bar; Settings, Spending.
    'tb-next', 'tb-cost', 'set-spending', 'spend-line', 'spend-pace', 'ceiling-custom', 'set-ceiling-amount'];

  function init() {
    for (const id of IDS) d[camel(id)] = document.getElementById(id);
    // Title
    d.btnNew.addEventListener('click', () => App.newGame());
    d.btnContinue.addEventListener('click', () => App.continueGame());
    d.btnUpdate.addEventListener('click', () => App.updateSave('autosave'));
    d.btnLoad.addEventListener('click', () => showScreen('saves'));
    d.btnSettings.addEventListener('click', () => showScreen('settings'));
    d.btnTheme.addEventListener('click', toggleTheme);
    d.titleModeAct.addEventListener('click', () => openKeySettings());
    d.btnBrokenDownload.addEventListener('click', () => { if (Storage.downloadAutosave()) toast('Downloaded the damaged autosave.'); });
    // Dismissed, the banner takes the focus with it to the screen (the box on a laptop's game), never the page.
    d.bannerClose.addEventListener('click', () => { const had = d.banner.contains(document.activeElement); d.banner.hidden = true; if (had) focusScreen(screen); });
    // Creation
    Create.wire();
    // Game top bar and menu
    d.tbSave.addEventListener('click', () => showScreen('saves'));
    d.tbSettings.addEventListener('click', () => showScreen('settings'));
    // Wave 43: the cost chip opens Settings at Spending, and follows every paid call.
    d.tbCost.addEventListener('click', openSpending);
    Api.onSpend(() => renderCost());
    d.tbPanel.addEventListener('click', () => setCollapsed(!d.gameBody.classList.contains('panel-collapsed')));
    d.tbMenu.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
    $$('[data-menu]', d.menuPop).forEach(b => b.addEventListener('click', e => {
      const m = b.dataset.menu;
      if (m === 'actions') { e.stopPropagation(); closeMenu(true); openActions(d.tbMenu); return; }
      closeMenu();
      if (m === 'title') App.quitToTitle(); else showScreen(m);
    }));
    wireMenuKeys(d.menuPop, () => closeMenu(true));
    wireMenuKeys(d.actPop, () => closeActions(true));
    document.addEventListener('click', e => {
      if (!d.menuPop.hidden && !d.menuPop.contains(e.target)) closeMenu();
      if (!d.actPop.hidden && !d.actPop.contains(e.target) && !(e.target.closest && e.target.closest('#act-btn, #act-btn-m'))) closeActions();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (d.ask.open) return; // the dialog closes itself
      if (!d.menuPop.hidden) closeMenu(true);
      else if (!d.actPop.hidden) closeActions(true);
      else if (mapPick) setPick(null, mapExpanded ? 'close' : null);
      else if (mapExpanded) setMapExpanded(false);
      else if (d.gameBody.classList.contains('sheet-open')) closeSheet();
    });
    // The offline demo bar and the second-tab bar
    d.demoBarClose.addEventListener('click', () => { demoBarHidden = true; renderDemoBar(); focusComposer(); });
    d.demoBarAct.addEventListener('click', () => {
      if (Storage.getApiKey()) { Storage.saveSettings({ mockMode: false }); toast(MOCK_OFF); renderDemoBar(); renderTitleMode(); }
      else openKeySettings();
    });
    // "Play here instead": the newer game the other tab saved is loaded here first, then this tab plays (App.playHere).
    d.tabBarTake.addEventListener('click', async () => { await App.playHere(); if (d.tabBar.hidden) focusComposer(); });
    // Feed
    d.feedScroll.addEventListener('scroll', () => { stick = nearBottom(); if (stick) d.newBtn.hidden = true; }, { passive: true });
    d.newBtn.addEventListener('click', scrollToBottom);
    // Undo (outside the live region): laid over the newest input line again whenever the story's size changes.
    d.undoBtn.addEventListener('click', () => runAction('/undo', d.undoBtn));
    // Wave 45: Skip to the story.
    d.skipLink.addEventListener('click', e => { e.preventDefault(); skipToStory(); });
    try { const ro = new ResizeObserver(() => placeUndo()); ro.observe(d.feed); ro.observe(d.feedScroll); } catch (e) { window.addEventListener('resize', () => placeUndo()); }
    // Composer
    // Send's label first: Wait → Send changes the box's width, so its height is measured after (autosize).
    d.cmd.addEventListener('input', () => { syncSendLabel(); autosize(); updateAc(); });
    syncSendLabel();
    d.cmd.addEventListener('keydown', onKey);
    // Leaving the box closes the command list a moment later; coming straight back keeps it.
    // While the box has the focus on a phone (the keyboard is up), the tab bar steps aside.
    let blurHide = null;
    d.cmd.addEventListener('blur', () => {
      clearTimeout(blurHide); blurHide = setTimeout(hideAc, 150);
      // A moment later, so a tap on a chip lands before the tab bar comes back.
      syncTypingSoon();
    });
    d.cmd.addEventListener('focus', () => {
      clearTimeout(blurHide); blurHide = null;
      clearTimeout(typingOff); typingOff = null;
      syncTyping();
    });
    // The box-side ⋯ and its list hold the typing layout while they have the focus (syncTyping); leaving them, it is looked at again.
    d.actBtn.addEventListener('blur', syncTypingSoon);
    d.actPop.addEventListener('focusout', syncTypingSoon);
    // The Say picker of a phone on its side stays while it has the focus (a native list may be open over it); after, the row is drawn again.
    // The picker holds the typing layout too (syncTyping), so leaving it, that is looked at again.
    d.sayTo.addEventListener('focusout', () => { setTimeout(() => { if (screen === 'game') renderComposer(); }, 0); syncTypingSoon(); });
    d.send.addEventListener('click', () => sendOrStop());
    // ⋯: beside the toggle on a laptop, at the end of the tab row on a phone (so the box keeps its width).
    for (const b of [d.actBtn, d.actBtnM]) b.addEventListener('click', e => { e.stopPropagation(); if (d.actPop.hidden) openActions(b); else closeActions(true); });
    d.queuedCancel.addEventListener('click', cancelQueued);
    composer.mode = Storage.settings().inputMode === 'say' ? 'say' : 'do';
    d.modeDo.addEventListener('click', () => { setMode('do'); focusComposer({ stay: true }); });
    d.modeSay.addEventListener('click', () => { setMode('say'); focusComposer({ stay: true }); });
    d.sayTo.addEventListener('click', e => {
      const b = e.target.closest('[data-to]');
      if (b && b.tagName === 'BUTTON' && setAddressee(b.dataset.to)) focusComposer({ stay: true });
    });
    d.sayTo.addEventListener('change', e => { if (e.target.classList.contains('say-pick') && setAddressee(e.target.value)) focusComposer({ stay: true }); });
    $$('[data-open-tab]').forEach(b => b.addEventListener('click', () => { sheetOpener = b; openPanel(b.dataset.openTab); }));
    // A tab row that comes on screen or changes width is fitted again (wave 26: fitTabs).
    try { const ro = new ResizeObserver(fitTabsSoon); ro.observe(d.panelTabs); const bar = $('.tabbar'); if (bar) ro.observe(bar); } catch (e) { window.addEventListener('resize', fitTabsSoon); }
    // Panel / sheet
    d.panelClose.addEventListener('click', closeSheet);
    d.panelBody.addEventListener('focusin', () => { if (editing) requestAnimationFrame(keepFieldClear); });
    d.panelTabs.addEventListener('keydown', onTabKey);
    wireSwipe();
    mq.addEventListener('change', () => {
      // What had the focus may be a control this layout does not show (Panel, the box-side ⋯, the tab row): its stand-in takes it first.
      const lost = focusLostToLayout();
      // The phone's Menu has no place on a laptop (its items are the top bar's own buttons there): it closes, its focus handed on below.
      if (!isMobile()) closeMenu();
      setMapExpanded(false); if (!isMobile()) closeSheet(); Create.layoutChanged(); renderComposer(); syncTip(); syncTyping();
      keepFocusThroughLayout(lost);
      // Narrowed, the laptop's panel is the shut sheet, still drawn for its slide down (0.26s): looked at again once that is over.
      afterSheetSlide(() => keepFocusThroughLayout(lost));
    });
    try { landMq.addEventListener('change', () => { syncTyping(); renderComposer(); }); } catch (e) { /* old browsers */ }
    // Where the focus last was, so a layout change that hides it (the box-side ⋯, Panel) can hand it on, never to the page.
    document.addEventListener('focusin', e => { lastFocus = e.target; });
    // Left for nowhere while still on screen (a tap on the page): nothing to hand on.
    document.addEventListener('focusout', e => { if (!e.relatedTarget && focusableNow(e.target)) lastFocus = null; });
    // An expanded map is sized to the window: drawn again when the window changes (a phone turned sideways).
    let mapResize = 0;
    // Turned or resized, it is drawn for the new view and centred on the player again (the old pan means nothing there).
    window.addEventListener('resize', () => { if (!mapExpanded || mapResize) return; mapResize = requestAnimationFrame(() => { mapResize = 0; if (mapExpanded) { refreshMap(null); panMapTo(State.current.player.locationId); } }); });
    // Settings and saves
    d.settingsForm.addEventListener('change', onSettingsChange);
    d.settingsForm.addEventListener('input', e => { if (e.target === d.setKey) onSettingsChange(e); });
    d.settingsForm.addEventListener('submit', e => e.preventDefault());
    d.settingsDone.addEventListener('click', back);
    d.setReread.addEventListener('click', () => App.updateGame());
    d.settingsQuit.addEventListener('click', () => App.quitToTitle());
    d.setCheckKey.addEventListener('click', checkKey);
    // Wave 44: Settings, "This device".
    document.getElementById('set-forget-key').addEventListener('click', forgetDeviceKey);
    document.getElementById('set-wipe').addEventListener('click', () => deleteDeviceData());
    d.savesDone.addEventListener('click', back);
    d.btnExport.addEventListener('click', () => { try { Storage.exportSave(); toast('Exported.'); renderLastExport(); } catch (e) { d.savesError.textContent = e.message; } });
    d.btnImport.addEventListener('click', () => d.importFile.click());
    d.importFile.addEventListener('change', onImport);
    // The question dialog
    // syncBanner at once too: the dialog's close event comes a moment later.
    d.askYes.addEventListener('click', () => { d.ask.close('yes'); syncBanner(); });
    d.askNo.addEventListener('click', () => { d.ask.close('no'); syncBanner(); });
    try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyDisplay); } catch (e) { /* old browsers */ }
    // The Pipeline reports each stage of a turn.
    Pipeline.setStatusListener(onPipelineStatus);
    // The undo stack changed (a step, an undo, the stack read back after a reload): the Undo link's count follows (wave 16).
    State.onUndo(why => { if (why !== 'switch' && screen === 'game') markUndo(); });
    initViewport();
    applyDisplay();
    setCollapsed(Storage.settings().panelCollapsed, true);
    renderComposer();
    while (pendingWarnings.length) warn(pendingWarnings.shift());
  }

  // ----- viewport (mobile keyboard) -----
  /* The keyboard is up: the visible height is well short of the tallest
     seen at this width (iOS shrinks the visual viewport; Android with
     resizes-content shrinks the window). */
  const tallest = { w: 0, h: 0 };
  function keyboardUp() {
    const w = window.innerWidth;
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (w !== tallest.w) { tallest.w = w; tallest.h = 0; }
    tallest.h = Math.max(tallest.h, window.innerHeight, h);
    return tallest.h - h > 120;
  }
  /* Typing on a phone (the box has the focus and the keyboard is up): the
     tab bar and the demo bar step aside so the story keeps its room (on its
     side the top bar too, and Say is the picker in the input row). The
     box-side ⋯, shown only while typing, holds that layout while it or its
     list has the focus: the list stays where it opened and the button is
     never hidden from under the focus (Shift+Tab from the box, ⋯ then Look
     around). Once the keyboard is down and the list closed, the focus (and
     a turn's hold on it) goes first to the ⋯ in the tab row, then the
     layout changes. The Say picker ("To: …") holds it too while the
     keyboard (or the picker wheel that takes its place on iOS) is up: the
     box and Send stay on screen beside it, and the story keeps its strip.
     On its side the picker also brings that layout on when it is tapped
     with the keyboard down (the wheel comes up in the keyboard's place):
     the story's strip is as short then as with the keyboard. */
  let typingOff = null;
  function syncTypingSoon() { clearTimeout(typingOff); typingOff = setTimeout(() => { typingOff = null; syncTyping(); }, 250); }
  function syncTyping() {
    if (!d.app || !d.cmd) return;
    const a = document.activeElement;
    const was = d.app.classList.contains('typing');
    const kb = keyboardUp();
    const onPick = (was || (isMobile() && landMq.matches)) && !!a && a.id === 'say-pick' && d.sayTo.contains(a);
    let on = (a === d.cmd || onPick) && kb;
    let handTo = null;
    if (!on && was && a && (a === d.actBtn || d.actPop.contains(a))) {
      if (kb || !d.actPop.hidden) on = true;
      else if (isMobile()) handTo = d.actBtnM;
    }
    if (on !== was) {
      const compact = compactComposer();
      d.app.classList.toggle('typing', on);
      if (handTo) moveFocus(focusableNow(handTo) ? handTo : [d.send, d.cmd].find(focusableNow), a);
      // On its side the box has three lines at most while typing, four otherwise (autosize).
      if (compact !== compactComposer()) { renderComposer(); autosize(); }
      if (stick && screen === 'game') scrollToBottom();
    }
  }
  /* A phone on its side with the keyboard up: the top bar steps aside and Say is the picker alone, beside the box (CSS: #app.typing in landscape). */
  function compactComposer() { return isMobile() && landMq.matches && !!d.app && d.app.classList.contains('typing'); }
  /* Where the Say row sits in the markup follows where it is drawn, so the
     focus order is the order on screen: its own row above the status line
     and the input row (as written), or, in the compact row above, in the
     input row between ⋯ and the box (Do, Say, ⋯, picker, box, Send; Shift+Tab
     from the box reaches the picker). Not moved into that row while it has
     the focus (the keyboard or the picker wheel is up: moving it would drop
     the focus and shut the wheel): the CSS order draws it in its place
     meanwhile, and it moves once the focus has left it (the Say row's
     focusout draws the composer again). Out of that row it goes at once
     (the keyboard is down), the focus kept on it. */
  function placeSayTo() {
    if (!d.sayTo || !d.cmd || !d.turnStatus) return;
    const wrap = d.cmd.closest('.input-wrap');
    const row = wrap && wrap.parentElement;
    if (!row) return;
    const compact = compactComposer();
    if (compact === (d.sayTo.parentElement === row)) return;
    const had = d.sayTo.contains(document.activeElement) ? document.activeElement : null;
    if (had && compact) return;
    if (compact) row.insertBefore(d.sayTo, wrap);
    else d.turnStatus.parentElement.insertBefore(d.sayTo, d.turnStatus);
    if (had && had.isConnected && document.activeElement !== had) had.focus({ preventScroll: true });
  }
  /* A layout change (across 900px) can hide what has the focus: the
     laptop's Panel, Save, Settings, box-side ⋯ and the whole side panel
     (narrowed, it is the shut sheet), or the phone's Menu and its items, tab
     row and the sheet's ×. Its stand-in in the new layout takes it. Run
     again once the sheet's slide is over (afterSheetSlide): whatever has
     the focus then and is on screen keeps it. */
  let lastFocus = null;
  function focusLostToLayout() {
    const a = document.activeElement;
    const was = a && a !== document.body ? a : lastFocus;
    const game = document.getElementById('screen-game');
    return was && was.isConnected && screen === 'game' && game && game.contains(was) ? was : null;
  }
  function keepFocusThroughLayout(was) {
    if (screen !== 'game') return;
    const a = document.activeElement;
    // Whatever has the focus now and is on screen keeps it (not something in the shut sheet: focusableNow).
    if (a && a !== document.body && focusableNow(a)) return;
    const from = a && a !== document.body ? a : was;
    if (!from) return;
    const tabBtn = from.dataset && from.dataset.openTab ? document.getElementById('tab-' + from.dataset.openTab) : null;
    const stand = new Map([[d.actBtn, d.actBtnM], [d.actBtnM, d.actBtn], [d.tbSave, d.tbMenu], [d.tbSettings, d.tbMenu], [d.tbPanel, d.tbMenu],
      [d.tbMenu, d.tbPanel], [d.panelClose, document.getElementById('tab-' + tab)]]).get(from) || tabBtn;
    // A Menu item: the laptop's own button for it (Save / Load, Settings, the box-side ⋯), else Panel, as for Menu itself.
    const menuItem = d.menuPop.contains(from) ? ({ saves: d.tbSave, settings: d.tbSettings, actions: d.actBtn })[from.dataset.menu] || d.tbPanel : null;
    // A tab of the laptop's panel: its button in the phone's tab row.
    const rowBtn = from.dataset && from.dataset.tab && d.panelTabs.contains(from) ? $(`[data-open-tab="${from.dataset.tab}"]`) : null;
    // Else the composer's place for it (the box on a laptop, Send on a phone): never the page.
    const to = [menuItem, stand, rowBtn, isMobile() ? d.send : d.cmd, d.send].find(focusableNow);
    if (to) moveFocus(to, from);
  }
  /* fn once the phone sheet's slide is over (0.26s; at once under reduced motion), or after 400ms at most. */
  function afterSheetSlide(fn) {
    let timer = 0;
    const done = e => {
      if (e && (e.target !== d.panel || e.propertyName !== 'visibility')) return;
      d.panel.removeEventListener('transitionend', done);
      clearTimeout(timer);
      fn();
    };
    d.panel.addEventListener('transitionend', done);
    timer = setTimeout(done, 400);
  }
  function initViewport() {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      syncTyping();
      if (editing) requestAnimationFrame(keepFieldClear);
      if (vv) {
        root.style.setProperty('--app-h', Math.round(vv.height) + 'px');
        d.app.style.transform = vv.offsetTop > 0 ? `translateY(${Math.round(vv.offsetTop)}px)` : '';
      }
      // The command list, if open, sized for the window as it is now (the keyboard up or down).
      sizeAc();
      if (vv && stick && screen === 'game') scrollToBottom();
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
    placeToast();
    d.toast.textContent = msg;
    d.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => d.toast.classList.remove('show'), 2600);
  }
  /* Where the toast goes: in the game, just above the composer, so it
     covers neither the box nor the bars at the top (the demo bar's Add key,
     the top bar); with the phone sheet or the expanded map open, or on
     another screen, near the bottom (CSS: --toast-bottom, at least 24px
     above the safe area). */
  function placeToast() {
    let bottom = 0;
    const sheet = isMobile() && !!d.gameBody && d.gameBody.classList.contains('sheet-open');
    const composer = $('#screen-game .composer');
    if (screen === 'game' && !sheet && !mapExpanded && composer) {
      const ref = getComputedStyle(d.app).transform !== 'none' ? d.app.getBoundingClientRect().bottom : window.innerHeight;
      bottom = Math.max(0, Math.round(ref - composer.getBoundingClientRect().top + 8));
    }
    d.toast.style.setProperty('--toast-bottom', bottom + 'px');
  }
  const MOCK_OFF = 'Offline demo off: playing with Claude.';
  /* The one check before anything that plays a turn or changes the game
     (Send, Wait, the ⋯ actions, the Undo link, Go there, the map's chip,
     Spend, a pronoun chip, Edit and Save on a person): not in a tab that is
     read only because another tab has the game (the bar's "Play here
     instead" is the way out), not without a game on screen, and not while a
     turn runs (opts.queue: unless the Pipeline can queue this one).
     opts.say: a refusal is said in a toast. */
  const READ_ONLY_NOTICE = 'This game is open in another tab. Press "Play here instead" to play it in this one.';
  function actBlock(opts) {
    if (Storage.readOnly) return READ_ONLY_NOTICE;
    if (screen !== 'game' || !State.current || State.muted) return 'There is no game in progress.';
    // opts.fill: only puts text in the box (Spend), which typing may do during a turn too.
    // opts.hand (wave 16): Undo, which takes back the turn of a hand open at cards, free.
    if (turnRunning() && !(opts && opts.fill) && !(opts && opts.queue && canQueue()) && !(opts && opts.hand && Pipeline.handOpen)) return App.BUSY_NOTICE;
    return '';
  }
  function canAct(opts) {
    const why = actBlock(opts);
    if (why && opts && opts.say) toast(why);
    return !why;
  }
  // ----- focus that is never dropped (wave 3) -----
  /* Can take the focus now: on the page, shown, not inert, not off, and
     not in the phone's sheet while it is shut (it stays drawn for its
     0.26s slide down, then hides whatever is in it). */
  function focusableNow(node) {
    if (!node || !node.isConnected || node.disabled || !node.getClientRects().length) return false;
    if (node.closest('[inert], [hidden]')) return false;
    if (inShutSheet(node)) return false;
    return getComputedStyle(node).visibility !== 'hidden';
  }
  function inShutSheet(node) { return isMobile() && !!d.panel && d.panel.contains(node) && !d.gameBody.classList.contains('sheet-open'); }
  /* What may be the sheet's opener, which the focus goes back to when it
     closes: a control on screen, in the page's tab order and outside the
     panel. Never the game's visually hidden heading (the phone's game
     screen focuses it, so a sheet opened by code would find it), never
     something hidden or about to be. */
  function openerOk(node) {
    return !!node && node !== document.body && focusableNow(node) && node.tabIndex >= 0 && !node.closest('.visually-hidden') && !d.panel.contains(node);
  }
  /* Turn a control off without taking the focus from it: the one the
     player is on is marked aria-disabled (it stays focusable, dimmed, and
     its handler refuses through canAct); any other is disabled. */
  function setOff(btn, off) {
    if (!btn) return;
    if (off && document.activeElement === btn) { btn.disabled = false; btn.setAttribute('aria-disabled', 'true'); }
    else { btn.disabled = !!off; btn.removeAttribute('aria-disabled'); }
  }
  /* A turn started from a control other than the box (the ⋯ list, the Undo
     link, Go there, the map's chip): that control keeps the focus while the
     turn runs, or, when it has to go, what stands in for it (the ⋯ button,
     the sheet's opener, the place's marker, the panel's tab), never the
     page. When the turn ends the focus goes to the box on a laptop and back
     to the opener (or the first stand-in still there) on a phone, but only
     if it is still where the turn left it: a field the player moved to
     meanwhile keeps it. keep: the opener, then its stand-ins in order. */
  let turnFocus = null;
  function holdTurnFocus(opener) { turnFocus = { keep: opener ? [opener] : [] }; }
  /* The focus moved on from something the turn holds (or from nowhere): what it moved to is held too. */
  function carryTurnFocus(from, to) {
    if (!turnFocus || !to || turnFocus.keep.includes(to)) return;
    if (!from || from === document.body || turnFocus.keep.includes(from)) turnFocus.keep.push(to);
  }
  /* Move the focus, carrying the turn's hold with it. */
  function moveFocus(to, from) {
    if (!to) return false;
    const was = from === undefined ? document.activeElement : from;
    to.focus({ preventScroll: true });
    if (document.activeElement === to) carryTurnFocus(was, to);
    return document.activeElement === to;
  }
  function releaseTurnFocus() {
    const tf = turnFocus;
    turnFocus = null;
    if (!tf || screen !== 'game') return;
    const a = document.activeElement;
    if (a && a !== document.body && !tf.keep.includes(a)) return;
    if (!isMobile()) { if (focusableNow(d.cmd)) d.cmd.focus({ preventScroll: true }); return; }
    const back = tf.keep.find(focusableNow) || [actButton(), d.send].find(focusableNow);
    if (back && back !== a) back.focus({ preventScroll: true });
  }
  /* The warning banner sits under the modal views and takes no focus while
     one is open (the phone sheet, the expanded map, a dialog); after, it is
     as it was. */
  function syncBanner() {
    if (!d.banner) return;
    const sheet = isMobile() && !!d.gameBody && d.gameBody.classList.contains('sheet-open');
    const map = mapExpanded && !!d.panelBody && !!$('.map.expanded', d.panelBody);
    d.banner.inert = sheet || map || !!(d.ask && d.ask.open);
    // Wave 45: so is the skip link (it leads to the story, which is inert under them).
    if (d.skipLink) d.skipLink.inert = d.banner.inert;
  }
  /* A question in a modal dialog (the page behind it takes no input):
     resolves true for the yes button, false for Cancel or Escape. The focus
     goes back where it was. */
  function ask(opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const dlg = d.ask;
      if (!dlg || typeof dlg.showModal !== 'function') { resolve(window.confirm(`${opts.title || ''}\n\n${opts.text || ''}`)); return; }
      if (dlg.open) dlg.close('no');
      d.askTitle.textContent = opts.title || '';
      d.askText.textContent = opts.text || '';
      d.askYes.textContent = opts.yes || 'OK';
      d.askNo.textContent = opts.no || 'Cancel';
      dlg.returnValue = '';
      const was = document.activeElement;
      dlg.addEventListener('close', () => {
        syncBanner();
        resolve(dlg.returnValue === 'yes');
        if (was && was.isConnected && typeof was.focus === 'function') was.focus({ preventScroll: true });
        // What had the focus went while the question was open: the screen's own place for it, never the page.
        if (!document.activeElement || document.activeElement === document.body) focusScreen(screen);
      }, { once: true });
      dlg.showModal();
      syncBanner();
      // The safe answer takes the focus: Enter or Space never does the drastic thing by accident.
      d.askNo.focus();
    });
  }

  // ----- screens -----
  /* Each screen's heading, which takes the focus when the screen opens. */
  const SCREEN_HEADS = { title: 'titleName', settings: 'settingsTitle', saves: 'savesTitle', game: 'gameTitle' };
  function showScreen(name) {
    const from = screen;
    if ((name === 'settings' || name === 'saves') && screen !== 'settings' && screen !== 'saves') returnTo = screen;
    // Leaving the game for a while: remember where the story was scrolled to.
    if (from === 'game' && name !== 'game') feedPlace = { top: d.feedScroll.scrollTop, stick };
    for (const sc of $$('.screen')) sc.classList.toggle('active', sc.id === 'screen-' + name);
    screen = name;
    closeMenu();
    closeActions();
    closeSheet(true);
    setMapExpanded(false);
    if (name === 'title') renderTitle();
    else if (name === 'settings') fillSettings();
    else if (name === 'saves') renderSaves();
    else if (name === 'game') {
      renderGame();
      // Back from Settings or Saves: the story where it was, unless it was at the bottom.
      const keep = feedPlace && (from === 'settings' || from === 'saves') && !feedPlace.stick;
      if (keep) { d.feedScroll.scrollTop = feedPlace.top; stick = nearBottom(); d.newBtn.hidden = true; } else scrollToBottom();
      feedPlace = null;
    }
    renderDemoBar();
    // Wave 45: the skip link is the game screen's (the other screens start with their heading and a short list of buttons).
    if (d.skipLink) d.skipLink.hidden = name !== 'game';
    focusScreen(name);
  }
  /* Wave 45: the skip link (the first stop of Tab on the game screen)
     takes the focus to the box, or, when the box cannot be used now (no
     game, a read-only tab, the box off), to the story itself, which takes
     the focus only for this (tabindex -1, gone again when it leaves). */
  function skipToStory() {
    if (App.inGame() && focusableNow(d.cmd) && !d.cmd.readOnly) { d.cmd.focus({ preventScroll: true }); return d.cmd; }
    focusFeed();
    return d.feed;
  }
  function focusFeed() {
    if (!d.feed.hasAttribute('tabindex')) {
      d.feed.setAttribute('tabindex', '-1');
      d.feed.addEventListener('blur', () => d.feed.removeAttribute('tabindex'), { once: true });
    }
    d.feed.focus({ preventScroll: true });
  }
  /* Screen readers hear where they are: the new screen's heading takes the
     focus. On a laptop the game's input takes it instead. */
  function focusScreen(name) {
    if (name === 'game' && !isMobile()) { d.cmd.focus({ preventScroll: true }); return; }
    const h = name === 'create'
      ? (!d.createModeView.hidden ? d.modeTitle : !d.createSummaryView.hidden ? d.summaryTitle : d.createTitle)
      : d[SCREEN_HEADS[name]];
    if (h && typeof h.focus === 'function') h.focus({ preventScroll: true });
  }
  function back() {
    if (returnTo === 'game' && !App.inGame()) returnTo = 'title';
    showScreen(returnTo || 'title');
  }
  /* The setting's first two sentences, and the rest (under "More about the town"). */
  function splitSetting(text) {
    const parts = String(text || '').match(/[^.!?]+(?:[.!?]+["”’)]*)(?:\s+|$)|[^.!?]+$/g) || [];
    return [parts.slice(0, 2).join('').trim(), parts.slice(2).join('').trim()];
  }
  /* "Tomas Reed · Day 3 · The Low Water": whose game Continue picks up. */
  function continueLine(env) {
    const st = isObj(env.state) ? env.state : null;
    const sum = isObj(env.summary) ? env.summary : {};
    const l = st && Array.isArray(st.locations) && isObj(st.player) ? st.locations.find(x => x && x.id === st.player.locationId) : null;
    const who = sum.player || (st && isObj(st.player) ? st.player.name : '');
    const day = sum.day || (st && isObj(st.time) ? st.time.day : null);
    const where = sum.location || (l ? l.name : '');
    return [who, day ? `Day ${day}` : '', where].filter(Boolean).join(' · ');
  }
  function renderTitle() {
    const t = TOWN_DATA;
    d.titleName.textContent = t.name;
    d.titleTagline.textContent = typeof t.tagline === 'string' && t.tagline ? t.tagline : 'Type what you do. Claude tells you what happens, and the town keeps moving with or without you.';
    const [first, rest] = splitSetting(t.setting);
    d.titleSetting.textContent = first;
    d.titleSettingMore.textContent = rest;
    d.titleMore.hidden = !rest;
    d.titleBuild.textContent = State.buildLine(); // Wave 46
    document.title = t.name;
    d.btnNew.disabled = busy;
    d.btnLoad.disabled = busy;
    // An autosave under older rules: Continue plays it as it is; Update brings it up to date first.
    const raw = Storage.peek(Storage.KEYS.autosave);
    const auto = raw && !raw.broken ? raw : null;
    const behind = !!auto && Upgrade.behind(auto.state);
    d.btnContinue.disabled = busy || !auto;
    // Wave 44: nothing to continue (a fresh profile, or only a damaged autosave, explained below): no dead button.
    d.continueGroup.hidden = !auto;
    // With an autosave, Continue comes first and is the primary button; New game steps back.
    d.btnContinue.classList.toggle('primary', !!auto);
    d.btnNew.classList.toggle('primary', !auto);
    if (auto) { if (d.continueGroup.nextElementSibling !== d.btnNew) d.menuList.insertBefore(d.continueGroup, d.btnNew); }
    else if (d.btnNew.nextElementSibling !== d.continueGroup) d.btnNew.after(d.continueGroup);
    d.btnUpdate.hidden = !behind;
    d.btnUpdate.disabled = busy;
    d.titleUpdateNote.hidden = !behind;
    d.continueSub.textContent = auto ? continueLine(auto) : '';
    d.continueSub.hidden = !auto;
    // Saved by a newer build: one line here, before it is loaded (the banner after loading is short too).
    d.titleNewerNote.hidden = !(auto && App.newerRules(auto.state));
    d.btnContinue.setAttribute('aria-describedby', ['continue-sub', 'title-newer-note'].filter(id => !document.getElementById(id).hidden).join(' ') || 'continue-sub');
    // A damaged autosave is explained, with a way to keep a copy.
    const broken = !!(raw && raw.broken);
    d.titleBroken.hidden = !broken;
    if (broken) d.titleBrokenText.textContent = `The autosave in this browser could not be read. ${String(raw.error || 'The saved game is damaged.').replace(/([^.])$/, '$1.')} Download it to keep a copy. A new or loaded game sets it aside as the previous autosave (Load → Restore previous).`;
    renderTitleMode();
  }
  /* The chip under the title's buttons: how the game is being played. */
  function renderTitleMode() {
    const s = Storage.settings();
    const key = !!Storage.getApiKey();
    let mode = 'live';
    let text = `Playing with Claude · ${s.narratorModel}`;
    let act = '';
    // Short enough to sit on one line with its link at 375 wide.
    if (s.mockMode) { mode = 'demo'; text = 'Offline demo (canned replies)'; act = key ? 'Use Claude' : 'Add API key'; }
    else if (!key) { mode = 'nokey'; text = 'Claude, no API key yet'; act = 'Add API key'; }
    d.titleMode.dataset.mode = mode;
    d.titleModeText.textContent = text;
    d.titleModeAct.textContent = act;
    d.titleModeAct.hidden = !act;
  }
  /* "Add API key": Settings with the key field ready; with a key already
     there, the demo just turns off. */
  function openKeySettings() {
    if (Storage.settings().mockMode && Storage.getApiKey()) {
      Storage.saveSettings({ mockMode: false });
      toast(MOCK_OFF);
      renderTitleMode();
      renderDemoBar();
      return;
    }
    showScreen('settings');
    d.setKey.focus({ preventScroll: false });
  }

  // ----- top bar, menu, panel -----
  function renderGame() {
    const s = State.current;
    if (!s) return;
    const l = State.loc(s.player.locationId);
    const wd = weekdayOf(s.time.day);
    d.tbWd.textContent = wd ? `${wd.slice(0, 3)} · ` : '';
    renderArc(s);
    d.tbLoc.textContent = l ? l.name : '';
    d.tbHp.textContent = `${s.player.hp}/${s.player.maxHp}`;
    const cash = currency();
    d.tbGold.textContent = cash ? money(s.player.gold) : String(s.player.gold);
    d.tbGoldUnit.textContent = cash ? '' : ' gold';
    renderPanel();
    renderComposer();
    renderDemoBar();
    renderCost();
    markUndo();
  }
  /* Wave 43: the day in the town's arc. #tb-time keeps the clock as the
     dividers say it ("Day 3 · Morning"); the day's span draws " of 21"
     after it (a phone: "/21") from the town's ending day, and once the
     ending is told ", after the ending" (a phone: nothing). Beside it on a
     laptop, the next town event still to come ("council meeting Tue,
     Day 6"), from the town's events (State.arc), never a list of its own. */
  function renderArc(s) {
    const a = State.arc();
    const day = el('span', { class: 'tb-day', id: 'tb-day' }, `Day ${s.time.day}`);
    day.dataset.of = a.ended ? ', after the ending' : a.endDay ? ` of ${a.endDay}` : '';
    day.dataset.short = !a.ended && a.endDay ? `/${a.endDay}` : '';
    d.tbTime.replaceChildren(day, ` · ${capFirst(s.time.phase)}`);
    const n = a.ended ? null : a.next;
    d.tbNext.hidden = !n;
    d.tbNext.textContent = n ? nextEventLine(n, s.time.day) : '';
  }
  /* "council meeting Tue, Day 6", "council meeting this evening". */
  function nextEventLine(n, today) {
    const title = /^the\s+/i.test(n.title) ? lowerFirst(n.title.replace(/^the\s+/i, '')) : n.title;
    if (n.day === today) return `${title} ${n.phase === 'night' ? 'tonight' : `this ${n.phase}`}`;
    const wd = weekdayOf(n.day);
    return `${title} ${wd ? `${wd.slice(0, 3)}, ` : ''}Day ${n.day}`;
  }
  /* Wave 43: the cost chip: this game's total ("$1.23"), after every paid
     call (Api.onSpend) and every change; hidden in the offline demo, before
     the game's first paid call and off the game screen. */
  function renderCost() {
    if (!d.tbCost) return;
    const c = State.current ? State.cost() : null;
    const on = screen === 'game' && !!c && !State.muted && !Storage.settings().mockMode && c.calls > 0;
    d.tbCost.hidden = !on;
    d.tbCost.parentNode.classList.toggle('has-cost', on);
    if (!on) return;
    const t = dollars(c.usd);
    d.tbCost.textContent = t;
    d.tbCost.setAttribute('aria-label', `This game has cost ${t}. Spending, in Settings`);
    d.tbCost.title = `This game has cost ${t} over ${c.turns} ${c.turns === 1 ? 'turn' : 'turns'}`;
  }
  function dollars(n) { return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`; }
  /* Settings, opened at Spending (the chip). */
  function openSpending() {
    showScreen('settings');
    if (!d.setSpending) return;
    try { d.setSpending.scrollIntoView({ block: 'start' }); } catch (e) { /* an old browser */ }
    d.setSpending.focus({ preventScroll: true });
  }
  /* Wave 43: what the rest of the arc may cost at this pace. o: { usd,
     turns, day, phase, endDay, ended }. The pace is the game's turns a day
     so far, or PACE_DAY turns a day until half a day has gone by. Returns
     null with no paid turn; more is null after the ending or without an
     end day. */
  const PACE_DAY = 20;
  function spendProjection(o) {
    const turns = o && Number.isFinite(o.turns) ? o.turns : 0;
    if (turns <= 0) return null;
    const perTurn = (Number(o.usd) || 0) / turns;
    if (!Number.isInteger(o.endDay) || o.ended) return { perTurn, perDay: null, left: null, assumed: false, more: null };
    const elapsed = Math.max(0, (o.day - 1) + Math.max(0, PHASES.indexOf(o.phase)) / 4);
    const left = Math.max(0, o.endDay - 1 - elapsed);
    const assumed = elapsed < 0.5;
    const perDay = assumed ? PACE_DAY : turns / elapsed;
    return { perTurn, perDay, left, assumed, more: perTurn * perDay * left };
  }
  /* "This game: $1.23 over 31 turns · this session: $0.40". */
  function spendLine() {
    const u = Api.usage && Api.usage.session;
    const sess = dollars(u ? u.cost : 0);
    if (!gameLoaded()) return `No game open · this session: ${sess}`;
    const c = State.cost();
    return `This game: ${dollars(c.usd)} over ${c.turns} ${c.turns === 1 ? 'turn' : 'turns'} · this session: ${sess}`;
  }
  /* "About $0.04 a turn; roughly $9 more to Day 21 at this pace." */
  function paceLine() {
    if (!gameLoaded()) return '';
    if (Storage.settings().mockMode) return 'The offline demo costs nothing.';
    const c = State.cost();
    const a = State.arc();
    const t = State.current.time;
    const p = spendProjection({ usd: c.usd, turns: c.turns, day: t.day, phase: t.phase, endDay: a.endDay, ended: a.ended });
    if (!p) return 'Nothing spent on this game yet.';
    const each = `About ${p.perTurn < 0.01 ? `$${p.perTurn.toFixed(3)}` : dollars(p.perTurn)} a turn`;
    if (p.more === null) return a.ended ? `${each}. The ending has been told; the town goes on.` : `${each}.`;
    if (p.left <= 0) return `${each}.`;
    const more = p.more >= 2 ? `$${Math.round(p.more)}` : dollars(p.more);
    return `${each}; roughly ${more} more to Day ${a.endDay} at ${p.assumed ? `about ${PACE_DAY} turns a day` : 'this pace'}.`;
  }
  function renderSpending() {
    if (!d.spendLine) return;
    d.spendLine.textContent = spendLine();
    d.spendPace.textContent = paceLine();
    const lim = Storage.settings().spendCeiling;
    const preset = lim === null ? 'off' : [5, 10, 20].includes(lim) ? String(lim) : 'custom';
    $$('input[name="set-ceiling"]').forEach(r => { r.checked = r.value === preset; });
    d.ceilingCustom.hidden = preset !== 'custom';
    if (preset === 'custom') d.setCeilingAmount.value = String(lim);
  }
  /* Wave 43: the spending ceiling. Once this game's cost reaches it, a
     notice in the story, once (meta.cost.noticed), and a question before
     the next paid turn (spendGate), until Keep going (meta.cost.asked).
     Raising or lowering the ceiling asks again at the new amount. */
  function ceilingNow() {
    const lim = Storage.settings().spendCeiling;
    if (!lim || Storage.settings().mockMode || !gameLoaded()) return null;
    const c = State.cost();
    return c.usd >= lim ? { lim, c } : null;
  }
  function spendNotice() {
    const x = ceilingNow();
    if (!x || x.c.noticed === x.lim) return false;
    feed.notice(`This game has now cost ${dollars(x.c.usd)}, past the ${dollars(x.lim)} you set in Settings. The next turn asks first.`);
    State.spend({ noticed: x.lim });
    return true;
  }
  /* The lines that call the API (a free command, /undo or /help, never asks). */
  const PAID_COMMAND = /^\/(look|zoom|skip|pass|rest|wait|fact|reroll)\b/i;
  /* null when nothing needs asking (the line goes at once, as before);
     else a promise of true (Keep going) or false (Stop). */
  function spendGate(text) {
    if (typeof text === 'string' && /^\//.test(text.trim()) && !PAID_COMMAND.test(text.trim())) return null;
    const x = ceilingNow();
    if (!x || x.c.asked === x.lim) return null;
    spendNotice();
    return ask({ title: `You set a pause at ${dollars(x.lim)}`, text: `You have spent ${dollars(x.c.usd)} on this game. Keep going?`, yes: 'Keep going', no: 'Stop' }).then(yes => {
      if (yes && State.current) State.spend({ asked: x.lim });
      return yes;
    });
  }
  /* The slim bar while the offline demo is on (closed for the page load with ×). */
  function renderDemoBar() {
    if (!d.demoBar) return;
    const on = screen === 'game' && !!State.current && !State.muted && Storage.settings().mockMode && !demoBarHidden;
    d.demoBar.hidden = !on;
    if (on) {
      d.demoBarText.textContent = 'Offline demo: replies are canned.';
      d.demoBarAct.textContent = Storage.getApiKey() ? 'Play with Claude' : 'Add key';
    }
  }
  /* Another tab wrote the autosave: this one stops saving and says so. */
  function otherTab(on) {
    if (!d.tabBar) return;
    d.tabBar.hidden = !on;
    d.app.classList.toggle('read-only', !!on);
    d.cmd.readOnly = !!on;
    // Nothing here may play or change the game: the ⋯ list closes, the Undo
    // link goes, Go there, Edit, Spend and the pronoun chips turn off.
    if (on) { closeActions(); hideAc(); if (mapPick) setPick(null); }
    markUndo();
    if (State.current && !State.muted) renderPanel();
    syncSendLabel();
  }
  function toggleMenu() { if (d.menuPop.hidden) openMenu(); else closeMenu(true); }
  function openMenu() {
    closeActions();
    // Just under the top bar, which takes a third line when the money does not fit beside the time (320 wide).
    const bar = $('#screen-game .topbar');
    d.menuPop.style.top = bar && bar.offsetHeight ? Math.round(bar.offsetTop + bar.offsetHeight) + 'px' : '';
    d.menuPop.hidden = false;
    d.tbMenu.setAttribute('aria-expanded', 'true');
    const first = $('[role="menuitem"]', d.menuPop);
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(refocus) {
    if (!d.menuPop || d.menuPop.hidden) return;
    d.menuPop.hidden = true;
    d.tbMenu.setAttribute('aria-expanded', 'false');
    // Back on Menu; a laptop has none (a window widened with it open): Panel stands in for it, never the page.
    if (refocus) { const to = [d.tbMenu, d.tbPanel, d.cmd].find(focusableNow); if (to) moveFocus(to); }
  }
  /* Up and down arrows (Home, End) move through a menu's items; Tab leaves
     it. In two columns (the ⋯ list on a phone on its side) Up and Down stay
     in the column, on from the foot of one column to the head of the next,
     and Left and Right go across to the item in the same row (or the
     nearest one). The columns are filled in the list's order (CSS
     grid-auto-flow: column), so Up and Down follow the list as read. */
  function wireMenuKeys(pop, close) {
    pop.addEventListener('keydown', e => {
      if (e.key === 'Tab') { close(); return; }
      const across = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (!across && !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const items = $$('[role="menuitem"]', pop).filter(b => !b.hidden && !b.disabled);
      // Where each item is drawn: column by column, top to bottom, is the order Up and Down follow.
      const at = new Map(items.map(b => { const r = b.getBoundingClientRect(); return [b, { x: Math.round(r.left), y: Math.round(r.top) }]; }));
      const order = items.slice().sort((p, q) => at.get(p).x - at.get(q).x || at.get(p).y - at.get(q).y);
      const cur = document.activeElement;
      const i = order.indexOf(cur);
      let to = null;
      if (across) {
        if (i < 0) return;
        const cols = [...new Set(order.map(b => at.get(b).x))];
        const col = cols[cols.indexOf(at.get(cur).x) + (e.key === 'ArrowRight' ? 1 : -1)];
        if (col === undefined) return; // one column, or the edge: nothing to go to
        const y = at.get(cur).y;
        to = order.filter(b => at.get(b).x === col).sort((p, q) => Math.abs(at.get(p).y - y) - Math.abs(at.get(q).y - y))[0];
      } else if (e.key === 'Home' || e.key === 'End') to = e.key === 'Home' ? order[0] : order[order.length - 1];
      else if (order.length) to = i < 0 ? order[0] : order[(i + (e.key === 'ArrowDown' ? 1 : -1) + order.length) % order.length];
      e.preventDefault();
      if (to) to.focus();
    });
  }
  // ----- the ⋯ actions list -----
  /* The everyday commands, so nobody needs to know the slash: each runs
     through Pipeline.submit like a typed command. */
  let actOpener = null;
  function actionItems() {
    const s = State.current;
    return [
      { id: 'look', label: 'Look around', cmd: '/look' },
      { id: 'wait', label: 'Wait until…', sub: 'wait' },
      { id: 'rest', label: 'Sleep', cmd: '/rest' },
      { id: 'recap', label: 'Recap', cmd: '/recap' },
      { id: 'undo', label: 'Undo last turn', cmd: '/undo' },
      { id: 'fact', label: 'Spend a story point', fill: '/fact ', off: !s || s.player.storyPoints < 1 },
      { id: 'help', label: 'Commands help', help: true }
    ];
  }
  function renderActions(sub) {
    // A turn item is off while a turn runs or in a read-only tab (the title says which).
    const why = actBlock();
    const whyFill = actBlock({ fill: true });
    // Undo last turn works with a hand open at cards too (wave 16).
    const whyUndo = actBlock({ hand: true });
    const item = (label, onclick, extra) => el('button', Object.assign({ type: 'button', class: 'btn ghost', role: 'menuitem', onclick }, extra || {}), label);
    let kids;
    d.actPop.setAttribute('aria-label', sub === 'wait' ? 'Wait until' : 'Actions and commands');
    if (sub === 'wait') {
      const now = State.current ? State.current.time.phase : '';
      kids = [el('p', { class: 'act-h', 'aria-hidden': 'true' }, 'Wait until…')]
        .concat(PHASES.filter(p => p !== now).map(p => item(`Until ${p}`, () => runAction(`/wait ${p}`), { dataset: { act: 'wait-' + p }, disabled: !!why, title: why || null })))
        .concat(item('Back', e => { e.stopPropagation(); renderActions(null); focusFirstAction(); }, { dataset: { act: 'back' } }));
    } else {
      kids = actionItems().map(a => item([a.label, a.cmd ? el('span', { class: 'act-k', 'aria-hidden': 'true' }, a.cmd) : null], e => {
        if (a.sub) { e.stopPropagation(); renderActions(a.sub); focusFirstAction(); return; }
        if (a.fill) { closeActions(); fillBox(a.fill); return; }
        if (a.help) { closeActions(true); Commands.run('/help'); return; }
        if (a.id === 'recap' && !Commands.LIST.some(c => c.name === '/recap')) { closeActions(true); showRecap(); return; }
        runAction(a.cmd);
      }, { dataset: { act: a.id }, disabled: !!a.off || (!!a.cmd && !!(a.id === 'undo' ? whyUndo : why)) || (!!a.fill && !!whyFill), title: a.off ? 'You have no story points' : (a.cmd && (a.id === 'undo' ? whyUndo : why)) || (a.fill && whyFill) || null }));
    }
    d.actPop.replaceChildren(...kids);
    // Two columns (a phone on its side) are filled column by column: the heading's row and half the items, rounded up (CSS: --act-rows).
    const items = kids.filter(k => k.getAttribute('role') === 'menuitem').length;
    d.actPop.style.setProperty('--act-rows', String(Math.ceil(items / 2) + (kids.length > items ? 1 : 0)));
  }
  function focusFirstAction() { const f = $('[role="menuitem"]:not([disabled])', d.actPop); if (f) f.focus({ preventScroll: true }); }
  /* The ⋯ button in view: beside the toggle on a laptop, in the tab row on a phone. */
  function actButton() { return isMobile() ? d.actBtnM : d.actBtn; }
  function openActions(opener, sub) {
    if (screen !== 'game' || !State.current || State.muted) return false;
    closeMenu();
    actOpener = opener || actButton();
    renderActions(sub || null);
    d.actPop.hidden = false;
    for (const b of [d.actBtn, d.actBtnM]) b.setAttribute('aria-expanded', String(b === actOpener));
    focusFirstAction();
    return true;
  }
  /* Closed with the focus in it (or asked to), the focus goes back to what
     opened it, or to the ⋯ button in view (a phone's box-side ⋯ goes when
     the keyboard does). */
  function closeActions(refocus) {
    if (!d.actPop || d.actPop.hidden) return;
    const inside = d.actPop.contains(document.activeElement);
    const was = document.activeElement;
    d.actPop.hidden = true;
    for (const b of [d.actBtn, d.actBtnM]) b.setAttribute('aria-expanded', 'false');
    if (refocus || inside) { const to = [actOpener, actButton()].find(focusableNow); if (to) moveFocus(to, inside ? null : was); }
    // Back on the box-side ⋯ with the keyboard down: the ⋯ in the tab row takes the focus before that one goes.
    syncTyping();
  }
  /* Put text in the box (/fact , /) with the cursor at its end. */
  function fillBox(text) {
    d.cmd.value = text;
    syncSendLabel();
    autosize();
    d.cmd.focus();
    try { d.cmd.setSelectionRange(text.length, text.length); } catch (e) { /* not a text box */ }
  }
  /* An action from the ⋯ list (or the Undo link, from: that link): the
     list closes and gives the focus back to its opener, which holds it
     while the turn runs; after, the box (laptop) or the opener (phone). */
  async function runAction(cmd, from) {
    closeActions(true);
    // Undo with a hand open at cards (wave 16): the turn that dealt it is taken back, free (Commands: Pipeline.takeBackHand).
    const hand = /^\/undo\b/i.test(cmd) && Pipeline.handOpen;
    if (!canAct({ say: true, hand })) return null;
    if (isMobile()) closeSheet();
    const opener = from || document.activeElement;
    holdTurnFocus(opener && opener !== document.body ? opener : null);
    let res = null;
    try { res = await (hand ? Commands.run(cmd) : Pipeline.submit(cmd, { mode: 'do', to: 'everyone' })); } catch (e) { console.error(e); }
    syncSendLabel();
    releaseTurnFocus();
    return res;
  }
  /* The recap on Continue: the Pipeline's text, as the recap notice. */
  function showRecap() {
    let text = null;
    try { text = Pipeline.recapText(); } catch (e) { console.error(e); }
    if (typeof text === 'string' && text.trim()) feed.notice(text.trim(), 'recap');
    return text;
  }
  function setCollapsed(c, silent) {
    d.gameBody.classList.toggle('panel-collapsed', !!c);
    d.tbPanel.setAttribute('aria-pressed', String(!c));
    if (!silent) Storage.saveSettings({ panelCollapsed: !!c });
  }
  /* The phone sheet is modal: the story and the bars behind it take no
     focus and no taps until it closes; the focus then goes back to what
     opened it. */
  function setInert(on) {
    for (const node of [$('.story', d.gameBody), $('#screen-game .topbar'), d.demoBar, d.tabBar]) if (node) node.inert = !!on;
    syncBanner();
  }
  function syncTabbar() {
    const open = !!d.gameBody && d.gameBody.classList.contains('sheet-open');
    $$('[data-open-tab]').forEach(b => b.setAttribute('aria-expanded', String(open && b.dataset.openTab === tab)));
  }
  function openSheet() {
    d.gameBody.classList.add('sheet-open');
    if (isMobile()) setInert(true);
    syncTabbar();
    d.panelClose.focus({ preventScroll: true });
  }
  function closeSheet(silent) {
    if (!d.gameBody) return;
    const was = d.gameBody.classList.contains('sheet-open');
    d.gameBody.classList.remove('sheet-open');
    d.panel.style.transform = '';
    d.panel.style.transition = '';
    setInert(false);
    syncTabbar();
    // The focus goes back to what opened the sheet, else to its tab in the tab bar (a sheet opened from code), never the page.
    // (Turned into a laptop with the sheet open, the panel stays on screen: what has the focus in it keeps it; the
    // sheet's ×, which a laptop has not, gives it to the panel's tab.)
    const a = document.activeElement;
    const lost = !a || a === document.body || (isMobile() && d.panel.contains(a));
    if (was && silent !== true && screen === 'game' && lost) {
      const to = [openerOk(sheetOpener) ? sheetOpener : null, $(`[data-open-tab="${tab}"]`), isMobile() ? null : document.getElementById('tab-' + tab)].find(focusableNow) || [actButton(), d.send].find(focusableNow);
      if (to) moveFocus(to);
    }
    if (was) sheetOpener = null;
  }
  function openPanel(id) {
    if (id === 'debug' && !debugOn) return;
    tab = id;
    renderPanel();
    if (isMobile()) {
      // Opened from code: what has the focus is the opener only if it is a control in view (openerOk); else the tab row's button for the tab (closeSheet).
      if (!sheetOpener && openerOk(document.activeElement)) sheetOpener = document.activeElement;
      openSheet();
    } else setCollapsed(false);
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
  /* Tabs: one tab stop; the arrow keys (Home, End) move between them. */
  function renderTabs() {
    const tabs = TABS.concat(debugOn ? [['debug', 'Debug']] : []);
    if (!tabs.some(t => t[0] === tab)) tab = 'character';
    d.panelTabs.dataset.count = String(tabs.length);
    // Objectives with what is waiting on the player ("Objectives · 4", wave 26), on the panel's tabs and the phone's tab row alike.
    const count = objectiveCount();
    d.panelTabs.replaceChildren(...tabs.map(([id, label]) => el('button', {
      type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': String(id === tab), 'aria-controls': 'panel-body', tabindex: id === tab ? '0' : '-1',
      dataset: { tab: id, label }, onclick: () => { tab = id; renderPanel(); }
    }, label)));
    for (const b of $$('[data-open-tab]')) { const t = TABS.find(x => x[0] === b.dataset.openTab); if (t) b.dataset.label = t[1]; }
    tabCount = count;
    fitTabs();
    syncTabbar();
  }
  /* Wave 26: a tab row that does not fit its labels whole (five tabs, or six
     with Debug, in the laptop's 320px panel or across a 320px phone) steps
     down until it does: 0 equal widths; 1 widths that follow the labels; 2
     a smaller face; 3 "Goals" for Objectives; 4 "You" for Character; 5 the
     smallest face. Measured where it is drawn (a row not on screen is
     fitted when it shows: fitTabsSoon, from a ResizeObserver). */
  let tabCount = 0;
  const FIT_MAX = 5;
  function tabLabel(id, label, level) {
    const short = TAB_SHORT[id] && level >= (id === 'objectives' ? 3 : 4) ? TAB_SHORT[id] : label;
    return id === 'objectives' && tabCount > 0 ? `${short} · ${tabCount}` : short;
  }
  function fitRow(row) {
    if (!row) return;
    const btns = $$('button', row).filter(b => b.dataset.label);
    const set = lv => { row.dataset.fit = String(lv); for (const b of btns) { const t = tabLabel(b.dataset.tab || b.dataset.openTab, b.dataset.label, lv); if (b.textContent !== t) b.textContent = t; } };
    if (!row.clientWidth) { set(Math.min(Number(row.dataset.fit) || 0, FIT_MAX)); return; }
    const over = () => row.scrollWidth > row.clientWidth + 1 || btns.some(b => b.scrollWidth > b.clientWidth + 1);
    for (let lv = 0; lv <= FIT_MAX; lv++) { set(lv); if (!over()) return; }
  }
  function fitTabs() { fitRow(d.panelTabs); fitRow($('.tabbar')); }
  let fitFrame = 0;
  function fitTabsSoon() { if (fitFrame) return; fitFrame = requestAnimationFrame(() => { fitFrame = 0; fitTabs(); }); }
  function onTabKey(e) {
    const tabs = $$('[role="tab"]', d.panelTabs);
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j === null) return;
    e.preventDefault();
    tab = tabs[j].dataset.tab;
    renderPanel();
    const t = document.getElementById('tab-' + tab);
    if (t) t.focus();
  }
  /* Where the focus was in the panel, so a re-render can put it back on the
     same control: its id, else its class and data-* attributes inside the
     nearest card, section or group that names itself. */
  const FOCUS_KEYS = ['npc', 'loc', 'sort', 'pron', 'go', 'section', 'group', 'thread', 'faction', 'rumour', 'obligation', 'objective', 'retry', 'settings'];
  function focusKey(node) {
    if (!node || node === d.panelBody || !d.panelBody.contains(node)) return null;
    if (node.id) return '#' + CSS.escape(node.id);
    const own = n => (n.classList[0] ? '.' + CSS.escape(n.classList[0]) : n.tagName.toLowerCase())
      + FOCUS_KEYS.filter(k => n.dataset[k] !== undefined).map(k => `[data-${k}="${CSS.escape(n.dataset[k])}"]`).join('');
    const scope = node.parentElement && node.parentElement.closest('[data-npc], [data-loc], [data-section], [data-group], [data-thread]');
    return (scope && d.panelBody.contains(scope) ? own(scope) + ' ' : '') + own(node);
  }
  function renderPanel() {
    // The tabs are drawn again too: a tab that had the focus gives it to the selected tab.
    const active = document.activeElement;
    const onTab = !!active && d.panelTabs.contains(active);
    renderTabs();
    if (onTab) { const t = document.getElementById('tab-' + tab); if (t) t.focus({ preventScroll: true }); }
    const s = State.current;
    // An open editor keeps what is typed; the control that had the focus keeps it, and the tab its scroll, through a re-render.
    const form = editing ? $('.pedit', d.panelBody) : null;
    const key = focusKey(active);
    const focusId = active && active.id && d.panelBody.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) ? active.id : null;
    const caret = focusId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    const scroll = d.panelBody.dataset.tab === tab ? d.panelBody.scrollTop : 0;
    if (form && form.dataset.npc === editing.id) editing.draft = readForm(form);
    if (editing && (!s || State.muted || !State.npc(editing.id))) editing = null;
    // The Objectives entries opened or shut by hand stay so through a redraw (wave 26).
    if (d.panelBody.dataset.tab === 'objectives') for (const x of $$('details.obj-d', d.panelBody)) { const li = x.closest('[data-objective]'); if (li) objOpen.set(li.dataset.objective, x.open); }
    d.panelBody.replaceChildren();
    d.panelBody.dataset.tab = tab;
    d.panelBody.setAttribute('aria-labelledby', 'tab-' + tab);
    if (tab !== 'places') { mapPick = null; mapExpanded = false; }
    if (!s || State.muted) return;
    d.panelBody.classList.toggle('editing', !!editing && tab === 'people');
    appendKids(d.panelBody, (PANELS[tab] || PANELS.character)(s));
    if (tab === 'places') placeChip($('.map', d.panelBody));
    if (tab === 'people') filterPeople();
    // Always: a tab change opens the new tab at its top (0), a redraw of the same tab keeps its place.
    d.panelBody.scrollTop = scroll;
    syncMapModal();
    if (!key) return;
    let again = null;
    try { again = $(key, d.panelBody); } catch (e) { again = null; }
    // The control is gone (a sort chip pressed, a card closed): the tab itself, never the page.
    if (!again || again.disabled || !again.getClientRects().length) again = document.getElementById('tab-' + tab);
    // Drawn again in the phone's sheet while it slides shut: nothing there keeps the focus; the composer's place for it does.
    if (again && inShutSheet(again)) again = [actButton(), d.send].find(focusableNow) || null;
    if (again) {
      // A turn's hold on the focus follows it (Go there gone after the walk: the tab holds it).
      moveFocus(again, active);
      if (caret && again.id === focusId) try { again.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text field */ }
    }
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
  /* Wave 30 (the integration plan's 14.1): where someone stands, in words,
     in place of the old five-segment meter: the stance phrase and one tag
     ("Suspicious of you · using you"), in the side's tint (data-side good,
     mixed, bad or neutral); "hates you", "in your corner" and "loyal to
     you" in bold. */
  const STRONG_STANCES = Object.freeze(['hates you', 'in your corner', 'loyal to you']);
  function stanceChip(n, tags) {
    const st = Rel.stance(n);
    const shown = st.tags.slice(0, Number.isInteger(tags) ? tags : 1);
    return el('span', { class: 'stance', dataset: Object.assign({ side: st.side, stance: st.phrase }, STRONG_STANCES.includes(st.phrase) ? { strong: '1' } : {}) },
      el('span', { class: 'stance-phrase' }, capFirst(st.phrase)), shown.map(t => el('span', { class: 'stance-tag' }, t)));
  }
  function whereLine(s, n, isHere) {
    if (isHere) return el('span', { class: 'pcard-where here' }, 'Here now');
    const v = (s.seen || {})[n.id];
    const l = v && State.loc(v.locationId);
    return l ? el('span', { class: 'pcard-where' }, `Last seen: ${placePhrase(l.name)}, `, el('span', { class: 'nowrap' }, `Day ${v.day} · ${capFirst(v.phase)}`)) : null;
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
     the player, what they remember (weight 2+ or the last 10 turns), known
     threads they are part of, and the loose end that ties them to the player. */
  function personNotes(s, n, skip) {
    const notes = [];
    for (const r of s.rumours) if (r.heard && (r.heardFrom || r.sourceNpcId) === n.id) notes.push(['Told you', r.text]);
    const dayOf = turn => { for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i].turn === turn) return s.log[i].day; return turn === 0 ? 1 : null; };
    // Wave 30: a memory the card gives as a reason is not said again here; one planted off-screen and not seen yet stays back too.
    const seenAt = (s.seen || {})[n.id];
    const hidden = m => m.seen === false && !(seenAt && Number.isInteger(seenAt.turn) && seenAt.turn > (m.turn | 0));
    const mems = Pipeline.pickMemories((n.memories || []).filter(m => !(skip && skip.has(m)) && !hidden(m)), s.meta.turn, { w3: 4, w2: 3, w1: 1, recent: 10, cap: 8 }).reverse();
    for (const m of mems) {
      const [k, t] = plainMemory(s, m.text);
      const day = dayOf(m.turn);
      notes.push([k, day ? `${t}, Day ${day}` : t]);
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
    // Wave 32: a tie the player saw change, the town knowing it, says so ("wife Mavis Mangum, strained since Day 5"; Rel.tieWords).
    const ties = State.tiesOf(n).has.map(x => { const m = State.npc(x.id); const pm = presenceOf(m); const words = Rel.tieWords(n, x.id); return `${x.relation || 'related to'} ${m.name}${pm === 'dead' ? ' (dead)' : pm === 'away' ? ' (lives elsewhere)' : ''}${words ? `, ${words}` : ''}`; });
    if (ties.length) rows.push(['Ties', ties.join('; ')]);
    if (known && typeof n.history === 'string' && n.history) rows.push(['History', n.history]);
    return rows.length ? el('dl', { class: 'kv pcard-facts' }, rows.map(([k, v]) => [el('dt', null, k), el('dd', { dataset: { fact: k.toLowerCase() } }, v)])) : null;
  }
  /* The line under the name of someone who is not in town. */
  function absentLine(n) {
    if (presenceOf(n) === 'dead') return n.died ? `Died ${n.died}` : 'Dead';
    return n.where ? `Lives elsewhere: ${n.where}` : 'Gone from town';
  }
  /* What is up with someone today, for their card: hurt, away for the day
     (school), a place they had you banned from, or a meeting with you still
     to come (wave 22). */
  function personFlags(s, n) {
    const out = [];
    const day = s.time.day;
    // Hurt: the engine's own test (State.isHurt: every day before hurtUntilDay).
    const hurt = State.isHurt(n);
    // "Until Day N" is the day it ends, for a hurt as for a ban: hurtUntilDay, the day they are about again, as the engine's note says it.
    if (hurt && Number.isInteger(n.hurtUntilDay)) out.push({ text: `Hurt until Day ${Math.max(day + 1, n.hurtUntilDay)}`, hard: true });
    // Away for the day (school): not for someone hurt, who is laid up instead (the Hurt flag says it; the engine's note would say it twice).
    if (!hurt && isObj(n.awayOn) && Array.isArray(n.awayOn.days) && n.awayOn.days.includes(weekdayOf(day))) {
      const note = State.absentNote(n) || '';
      out.push({ text: note ? capFirst(note) : `Away ${weekdayOf(day)}s${n.awayOn.where ? ' ' + n.awayOn.where : ''}`, hard: false });
    }
    for (const b of (Array.isArray(s.bans) ? s.bans : [])) {
      if (!isObj(b) || b.byNpcId !== n.id || !(b.untilDay > day)) continue;
      const l = State.loc(b.locationId);
      if (l) out.push({ text: `Banned you from ${placePhrase(l.name)} until Day ${Pipeline.banBackDay(b)}`, hard: true });
    }
    // A meeting agreed in the story, still to come (wave 22): "Meeting you: the Low Water, this morning (back door, half past ten)".
    for (const a of State.appointments(n.id)) out.push({ text: `Meeting you: ${a.place}, ${a.when}${a.detail ? ` (${a.detail})` : ''}`, hard: false, appt: a.seedId });
    // Something they asked of the player, not yet come due (wave 26): "Asked you: the outboard part from you by Day 3 (Saturday)".
    for (const a of State.asks(n.id)) out.push({ text: `Asked you: ${Pipeline.askShort(a, { bare: true })}`, hard: false, ask: a.seedId });
    return out;
  }
  /* Wave 30 (the integration plan's 14.1, design section 7.1): where they
     stand on an open card: the stance and up to two tags, two dated
     reasons ("You called him a liar." "Day 3 · you apologised"; "hates
     you" always with its reason; a report that came through a tie the town
     does not know only its day, "Cooler since Day 3. Hasn't said why."; a
     line planted off-screen only once the player has been in a scene with
     them since), what is held between them (Rel.leverageLines), what is
     owed either way, then a "More" fold with the tracks in words (Likes
     you, Trusts you, Scared, Knows you, Spark, Romance, Owes; wave 35, the
     owner's "the more detailed the better": all seven for an adult
     whatever their values, and the five that apply, never Spark or
     Romance, for anyone under 18 and with a player under 18). A screen reader hears the stance, tags and
     reasons as one sentence; the fold only when it is opened. Returns {
     node, fold, used (the memories given as reasons) }. */
  const wordsOpen = new Set();
  function personStanding(s, n) {
    const st = Rel.stance(n);
    const mems = Array.isArray(n.memories) ? n.memories : [];
    const seenAt = (s.seen || {})[n.id];
    const visible = r => !r.unseen || (seenAt && Number.isInteger(seenAt.turn) && seenAt.turn > (r.turn | 0));
    const worthy = r => r.leverage || r.hidden || (Number.isInteger(r.i) && isObj(mems[r.i]) && !State.protectedMemory(mems[r.i]) && (isObj(mems[r.i].d) || (mems[r.i].weight | 0) >= 2));
    let why = Rel.reasons(n, 8).filter(visible).filter(worthy);
    // "Hates you" always says why: its unsettled weight-3 harm first.
    if (st.phrase === 'hates you') { const at = why.findIndex(r => r.harm && (r.weight | 0) >= 3); if (at > 0) why.unshift(why.splice(at, 1)[0]); }
    why = why.slice(0, 2);
    const used = new Set(why.filter(r => Number.isInteger(r.i)).map(r => mems[r.i]).filter(Boolean));
    const words = why.map(r => Object.assign({ r }, Pipeline.reasonText(n, r, { player: s.player })));
    const levShown = new Set(why.filter(r => r.leverage).map(r => `${r.leverage}|${r.line}`));
    const lev = Rel.leverageLines(n).filter(x => !levShown.has(`${x.id}|${x.line}`));
    const pr = PRONOUN_FORMS[n.pronouns] || PRONOUN_FORMS.they;
    const owed = (n.rel && Array.isArray(n.rel.owed) ? n.rel.owed : []).filter(o => isObj(o) && Number(o.dir)).map(o => {
      const what = o.why ? Pipeline.turnMemory(n, { text: o.why, event: Number(o.dir) > 0 ? 'did_favour' : 'they_helped' }, s.player) : '';
      return `${Number(o.dir) > 0 ? 'Owes you one' : `You owe ${pr.obj} one`}${what ? `: ${what}` : ''}${Number.isInteger(o.day) ? `, Day ${o.day}` : ''}`;
    });
    const tags = st.tags.slice(0, 2);
    const sentence = [`${capFirst(st.phrase)}${tags.length ? `, ${tags.join(', ')}` : ''}.`].concat(words.map(w => `${w.card}${w.meta ? ` ${w.meta}.` : ''}`)).join(' ');
    const item = w => el('li', { dataset: { kind: w.r.leverage ? 'leverage' : w.hidden ? 'hidden' : 'memory' } }, w.card, w.meta ? el('span', { class: 'meta' }, w.meta) : null);
    const node = el('div', { class: 'pcard-stance', dataset: { stance: st.phrase } },
      el('p', { class: 'visually-hidden' }, sentence),
      el('div', { 'aria-hidden': 'true' }, stanceChip(n, 2), words.length ? el('ul', { class: 'pcard-why' }, words.map(item)) : null),
      lev.length ? el('ul', { class: 'pcard-why pcard-lev' }, lev.map(x => el('li', { dataset: { kind: 'leverage', lev: x.id } }, x.line, Number.isInteger(x.day) ? el('span', { class: 'meta' }, `Day ${x.day}`) : null))) : null,
      owed.length ? el('ul', { class: 'pcard-why pcard-owed' }, owed.map(t => el('li', { dataset: { kind: 'owed' } }, t))) : null);
    const c = Rel.tracksOf(n);
    const b = n.rel && isObj(n.rel.bands) ? n.rel.bands : {};
    const rows = [['Likes you', 'likes', Rel.words('w', c.w, b.w)], ['Trusts you', 'trusts', Rel.words('t', c.t, b.t)], ['Scared', 'scared', Rel.words('f', c.f, b.f)], ['Knows you', 'knows', Rel.words('k', c.k)]];
    // Spark and Romance for an eligible adult only (Rel.eligible is false for anyone under 18 and with a player under 18); favours owed for everyone.
    if (Rel.eligible(n)) rows.push(['Spark', 'spark', Rel.words('s', c.s, b.s)], ['Romance', 'romance', Rel.words('m', c.m, b.m)]);
    rows.push(['Owes', 'owed', Rel.words('owed', c.owed)]);
    const fold = el('details', { class: 'pcard-words-fold', open: wordsOpen.has(n.id), ontoggle: e => { if (e.target.open) wordsOpen.add(n.id); else wordsOpen.delete(n.id); } },
      el('summary', null, 'More'),
      el('dl', { class: 'pcard-words' }, rows.map(([k, key, v]) => el('div', { class: 'pcard-word', dataset: { word: key } }, el('dt', null, k), el('dd', null, v)))));
    return { node, fold, used };
  }
  function personCard(s, n, isHere) {
    const heard = heardOfOnly(s, n);
    const known = !!n.knownToPlayer || heard;
    const name = heard ? n.name : npcLabel(n);
    const open = openPerson === n.id;
    const status = n.alive === false ? 'dead' : (n.status && n.status !== 'free' ? n.status : '');
    const absent = presenceOf(n) !== 'here';
    const moreId = 'pmore-' + n.id;
    // Wave 30: where they stand (not for someone absent or only heard of), and the memories it gives as reasons, which Notes leaves out.
    const standing = !absent && !heard ? personStanding(s, n) : null;
    const notes = personNotes(s, n, standing ? standing.used : null);
    const facts = personFacts(s, n, known);
    const edit = !!editing && editing.id === n.id;
    // Changing someone (pronouns, Edit) waits for a turn to end, and never happens in a read-only tab.
    const block = actBlock();
    const age = ageText(n.age);
    // Someone not in town says so under their name instead (Died ..., Lives elsewhere: ...).
    const roleLine = [capFirst(n.role || ''), State.relationNote(n), absent ? '' : status].filter(Boolean).join(' · ');
    // What the search box matches: the name (or how a stranger is described), the role, and the places the player knows them by.
    const seenAt = (s.seen || {})[n.id];
    const seenLoc = isHere ? State.loc(s.player.locationId) : seenAt ? State.loc(seenAt.locationId) : null;
    const home = n.home && n.home.locationId ? State.loc(n.home.locationId) : null;
    const search = [name, n.role || '', roleLine, seenLoc ? seenLoc.name : '', home && (home.discovered || home.away === true) ? home.name : ''].join(' ').toLowerCase();
    return el('article', { class: 'pcard' + (known ? '' : ' stranger') + (open ? ' open' : '') + (edit ? ' editing' : ''), dataset: { npc: n.id, status: status || 'free', search } },
      el('button', { type: 'button', class: 'pcard-head', id: 'phead-' + n.id, 'aria-expanded': String(open), 'aria-controls': moreId, onclick: () => togglePerson(n.id) },
        el('span', { class: 'mono', dataset: { hue: String(personHue(n.id)) }, 'aria-hidden': 'true' }, initials(name)),
        el('span', { class: 'pcard-main' },
          el('span', { class: 'pcard-nameline' }, el('span', { class: 'pcard-name' }, name),
            age ? el('span', { class: 'pcard-age', title: 'Age' }, `· ${age}`) : null,
            el('span', { class: 'pcard-pron', title: 'Pronouns' }, pronounLabel(n.pronouns))),
          roleLine ? el('span', { class: 'pcard-role' }, roleLine) : null,
          el('span', { class: 'pcard-meta' }, absent ? el('span', { class: 'pcard-where away' }, absentLine(n)) : heard ? el('span', { class: 'pcard-where' }, 'Heard of, not met') : [stanceChip(n), whereLine(s, n, isHere)],
            absent ? null : personFlags(s, n).map(f => el('span', { class: 'pcard-flag' + (f.hard ? '' : ' soft'), dataset: Object.assign({ flag: '1' }, f.appt ? { appt: f.appt } : {}, f.ask ? { ask: f.ask } : {}) }, f.text)))),
        el('span', { class: 'pcard-chev', 'aria-hidden': 'true' })),
      el('div', { class: 'pcard-more', id: moreId, hidden: !open }, edit ? editForm(s, n) : [
        n.look ? el('p', { class: 'pcard-look' }, n.look) : null,
        standing ? standing.node : null,
        facts,
        notes.length ? [el('h4', { class: 'pcard-notes-h' }, 'Notes'),
          el('ul', { class: 'pcard-notes' }, notes.map(([k, t]) => el('li', null, el('span', { class: 'note-k' }, k + ': '), t)))] : null,
        standing ? standing.fold : null,
        !n.look && !notes.length && !facts && !standing ? el('p', { class: 'pcard-none' }, 'Nothing more yet.') : null,
        el('div', { class: 'pcard-fix' }, el('span', { class: 'pcard-fix-k' }, 'Pronouns'),
          el('span', { class: 'chips pcard-chips', role: 'group', 'aria-label': `Pronouns for ${name}` }, PRONOUNS.map(p => el('button', { type: 'button', class: 'chip pcard-pchip', 'aria-pressed': String(n.pronouns === p), dataset: { pron: p }, disabled: !!block, title: block || null, onclick: () => { if (canAct({ say: true })) App.setPronouns(n.id, p); } }, pronounLabel(p)))),
          el('button', { type: 'button', class: 'btn small pcard-edit', id: 'pedit-btn-' + n.id, 'aria-label': `Edit ${name}`, disabled: !!block, title: block || null, onclick: () => startEdit(n.id) }, 'Edit'))]));
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
  /* Wave 30 (the integration plan's 14.2): "How they feel about you", four
     sliders (Likes is attitude, Trusts, Scared, Knows) and Interested
     (0..100) for an eligible adult only (shown at 0 and off for anyone
     under 18, left out when the player is under 18), each with its word
     ("+40 · a lot"). Wave 35 (the owner: "I want 6 sliders with spark
     too", then "Do it 7 then"): seven, Likes, Trusts, Scared, Knows,
     Spark (Interested relabelled), Romance (the same rule as Spark) and
     Owes you (-3..3, everyone: the favours' net, set as one entry by
     hand); what is set lands in fix (it never drifts). A memory
     keeps every field it has through the form (day, act, event, d, decay,
     settled, key, fight, witness, scene, secondhand, leverageId, about,
     seen): the form edits only its words and weight, and shows what kind
     of thing it was and how long it lasts ("hit · fades in weeks"); Add
     picks what it was (EDIT_EVENTS: the table's change for it lands with
     it), else it is noted. What is held between them can be deleted
     (leverageSet void). */
  const FEEL_ROWS = Object.freeze([['w', 'attitude', 'Likes', -100, 100], ['t', 'trust', 'Trusts', -100, 100], ['f', 'fear', 'Scared', 0, 100], ['k', 'knows', 'Knows', 0, 100]]);
  // Wave 35: the two romantic sliders after them (interestMode), then favours owed for everyone (the ledger's net, -3..3).
  const ROMANCE_ROWS = Object.freeze([['s', 'spark', 'Spark', 0, 100], ['m', 'romance', 'Romance', 0, 100]]);
  const OWED_ROW = Object.freeze(['owed', 'owed', 'Owes you', -3, 3]);
  const EDIT_EVENTS = Object.freeze([['noted', 'Just noted'], ['complimented', 'A kind word'], ['insulted', 'An insult'], ['did_favour', 'You did them a favour'], ['they_helped', 'They helped you'], ['crossed', 'You crossed them']]);
  const DECAY_WORDS = Object.freeze({ mood: 'fades in a day or two', slight: 'fades in days', wound: 'fades in weeks', scar: 'fades slowly', keeps: 'stays' });
  function memoryLabel(m) {
    const ev = isObj(m) && typeof m.event === 'string' && Rel.EVENTS[m.event] ? m.event : Rel.typeMemory(m || {});
    const cls = !isObj(m) || !isObj(m.d) ? 'keeps' : typeof m.decay === 'string' && DECAY_WORDS[m.decay] ? m.decay : (Rel.EVENTS[ev] || {}).decay || 'wound';
    return `${ev.replace(/_/g, ' ')} · ${DECAY_WORDS[cls] || 'stays'}`;
  }
  // Spark and Romance on the form (wave 35; wave 34's Interested): 'on' for every adult (Rel.eligible, listed or not), 'off' (0, disabled) for anyone under 18, null (left out) when the player is under 18.
  function interestMode(n) { if (Rel.playerMinor()) return null; if (Rel.isMinor(n)) return 'off'; return Rel.eligible(n) ? 'on' : null; }
  function editBase(n) {
    const c = isObj(n.created) ? n.created : {};
    const traits = (n.personality || []).slice(0, 3);
    while (traits.length < 3) traits.push('');
    const tr = Rel.tracksOf(n);
    const lev = Rel.holdsOver(n).concat(Rel.heldOverPlayer(n, undefined, true)).map(x => ({ id: x.id, line: x.holder === 'player' ? `You know: ${x.text}.` : `${n.name} has something on you: ${x.text}.`, status: x.status }));
    return {
      name: n.name, age: Number.isInteger(n.age) ? String(n.age) : '', pronouns: validPronouns(n.pronouns) || 'they', role: n.role || '', look: n.look || '', voice: n.voice || '', history: typeof n.history === 'string' ? n.history : '', traits,
      attitude: n.attitude | 0, rel: { t: tr.t, f: tr.f, k: tr.k, s: interestMode(n) === 'on' ? tr.s : 0, m: interestMode(n) === 'on' ? tr.m : 0, owed: tr.owed }, relTo: c.relationToNpcId || '', relation: c.relationToNpcId ? c.relation || '' : '',
      home: n.home && n.home.locationId ? n.home.locationId : '', status: n.alive === false ? 'dead' : (n.status || 'free'),
      // Every field a memory has, kept as it is (only the words and weight are edited).
      memories: (n.memories || []).map(m => Object.assign(deepCopy(m), { model: m.model === true })),
      leverage: lev, voidLeverage: [],
      goal: n.goal || '', secret: n.secret || '', hiddenOpen: false, moreOpen: false
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
    // Wave 30: how they feel, each slider with its word; wave 35: seven (FEEL_ROWS, ROMANCE_ROWS by interestMode, OWED_ROW).
    const word = (x, a) => `${(x === 'w' || x === 't' || x === 'owed') && a > 0 ? '+' : ''}${a} · ${Rel.words(x, a) || 'no'}`;
    const vRel = isObj(v.rel) ? v.rel : { t: 0, f: 0, k: 0, s: 0, m: 0, owed: 0 };
    const slider = (x, name, label, min, max, value, extra) => {
      const out = el('output', { class: 'pedit-att-word', id: fid(name + '-word'), for: fid(name) }, word(x, value));
      const range = el('input', Object.assign({ class: 'pedit-range', id: fid(name), name, type: 'range', min: String(min), max: String(max), step: '1', value: String(value), 'aria-valuetext': word(x, value), dataset: { track: x },
        oninput: e => { const a = parseInt(e.target.value, 10) || 0; out.textContent = word(x, a); e.target.setAttribute('aria-valuetext', word(x, a)); } }, extra || {}));
      return el('div', { class: 'field pedit-feel-row', dataset: { track: x } }, el('label', { class: 'label', for: fid(name) }, label), el('div', { class: 'pedit-att' }, range, out));
    };
    const im = interestMode(n);
    const feel = el('fieldset', { class: 'field pedit-feel' }, el('legend', { class: 'label' }, 'How they feel about you'),
      FEEL_ROWS.map(([x, name, label, lo, hi]) => slider(x, name, label, lo, hi, x === 'w' ? v.attitude : vRel[x] | 0)),
      im ? ROMANCE_ROWS.map(([x, name, label, lo, hi]) => slider(x, name, label, lo, hi, im === 'on' ? vRel[x] | 0 : 0, im === 'off' ? { disabled: true, title: 'Nobody under 18 is ever interested in anyone, or anyone in them.' } : {})) : null,
      slider(OWED_ROW[0], OWED_ROW[1], OWED_ROW[2], OWED_ROW[3], OWED_ROW[4], vRel.owed | 0));
    // What is held between them, each with Delete (voided on Save).
    const levs = (Array.isArray(v.leverage) ? v.leverage : []).filter(x => !(v.voidLeverage || []).includes(x.id));
    const levBox = levs.length ? el('fieldset', { class: 'field pedit-levs' }, el('legend', { class: 'label' }, 'What is held between you'),
      levs.map(x => el('div', { class: 'pedit-lev', dataset: { lev: x.id } }, el('span', null, `${x.line} (${x.status})`),
        el('button', { type: 'button', class: 'btn small pedit-lev-del', 'aria-label': `Delete: ${x.line}`, onclick: () => editLeverage(x.id) }, 'Delete')))) : null;
    const relation = input('relation', v.relation, max.relation, { placeholder: 'wife, brother, boss', disabled: !v.relTo });
    const relTo = select('relTo', v.relTo, [['', 'Nobody']].concat(others.map(m => [m.id, m.name + (m.alive === false ? ' (dead)' : '')])),
      { onchange: e => { relation.disabled = !e.target.value; } });
    const mems = v.memories.map((m, i) => el('div', { class: 'pedit-mem', dataset: { i: String(i) } },
      el('label', { class: 'visually-hidden', for: fid('mem-' + i) }, `Memory ${i + 1}`),
      el('textarea', { class: 'input', id: fid('mem-' + i), rows: '2', maxlength: String(max.memory), value: m.text, dataset: { mem: 'text' }, placeholder: 'What they remember about you' }),
      // Wave 30: what kind of thing it was and how long it lasts (read only), or for a new one, what it was.
      m.isNew ? [el('label', { class: 'visually-hidden', for: fid('meme-' + i) }, `What memory ${i + 1} was`),
        (() => { const e = el('select', { class: 'input pedit-mem-event', id: fid('meme-' + i), dataset: { mem: 'event' } }, EDIT_EVENTS.map(([val, label]) => el('option', { value: val }, label))); e.value = m.event || 'noted'; return e; })()]
        : el('span', { class: 'pedit-mem-kind hint', dataset: { mem: 'kind' } }, memoryLabel(m)),
      el('label', { class: 'visually-hidden', for: fid('memw-' + i) }, `How much memory ${i + 1} matters`),
      (() => { const w = el('select', { class: 'input', id: fid('memw-' + i), dataset: { mem: 'weight' } }, WEIGHTS.map(([val, label]) => el('option', { value: String(val) }, label))); w.value = String(m.weight); return w; })(),
      el('button', { type: 'button', class: 'btn small pedit-mem-del', 'aria-label': `Remove memory ${i + 1}`, onclick: () => editMemories(list => list.splice(i, 1), i) }, 'Remove')));
    const full = v.memories.length >= State.MEMORY_MAX;
    return el('form', { class: 'pedit', dataset: { npc: id }, 'aria-label': `Edit ${n.name}`, tabindex: '-1', novalidate: true, onsubmit: e => e.preventDefault(), onkeydown: editKey },
      field('name', 'Name', input('name', v.name, max.name)),
      field('age', 'Age', el('input', { class: 'input pedit-age', id: fid('age'), name: 'age', type: 'number', inputmode: 'numeric', min: '0', max: String(max.age), step: '1', value: v.age, autocomplete: 'off' }), presenceOf(n) === 'dead' ? 'Their age when they died.' : `A whole number, 0 to ${max.age}.`),
      field('pronouns', 'Pronouns', select('pronouns', v.pronouns, PRONOUNS.map(p => [p, pronounLabel(p)]))),
      field('role', 'Role', input('role', v.role, max.role), 'Who they are or what they do, in a line.'),
      // The long texts, folded away until wanted, so the phone editor stays short.
      el('details', { class: 'pedit-more', open: v.moreOpen === true },
        el('summary', null, 'Look, voice and history'),
        field('look', 'Look', area('look', v.look, max.look, 3)),
        field('voice', 'Voice', area('voice', v.voice, max.voice, 2)),
        field('history', 'History', area('history', v.history, max.history, 3), 'Where they come from and what happened to them: what the town knows.')),
      el('div', { class: 'field' }, el('span', { class: 'label', id: fid('traits') }, 'Personality'),
        el('div', { class: 'pedit-traits', role: 'group', 'aria-labelledby': fid('traits') }, [0, 1, 2].map(i => input('trait' + i, v.traits[i] || '', max.trait, { 'aria-label': `Trait ${i + 1}`, placeholder: ['stubborn', 'kind', 'nosy'][i] })))),
      feel,
      levBox,
      field('relTo', 'Related to', relTo),
      field('relation', 'Relation', relation, 'What they are to that person.'),
      field('home', 'Home', select('home', v.home, [['', 'Nowhere / off-screen']].concat(places.map(l => [l.id, l.name]))), 'Where they are whenever nothing else has them.'),
      el('fieldset', { class: 'field pedit-status' }, el('legend', { class: 'label' }, 'Status'),
        el('div', { class: 'seg' }, EDIT_STATUSES.map(([val, label]) => el('label', null, el('input', { type: 'radio', name: 'status', value: val, checked: v.status === val, dataset: { status: val } }), label)))),
      el('fieldset', { class: 'field pedit-mems' }, el('legend', { class: 'label' }, 'Memories'),
        mems.length ? mems : el('p', { class: 'empty' }, 'They remember nothing about you.'),
        el('button', { type: 'button', class: 'btn small pedit-add', disabled: full, title: full ? `At most ${State.MEMORY_MAX} memories` : null,
          onclick: () => editMemories(list => list.push({ turn: State.current.meta.turn, day: State.current.time.day, text: '', weight: 2, model: false, isNew: true, event: 'noted' }), v.memories.length) }, 'Add a memory')),
      el('details', { class: 'pedit-hidden', open: v.hiddenOpen === true },
        el('summary', null, 'Hidden from you: goal and secret'),
        el('p', { class: 'hint' }, "These are the game's secrets about this person. Reading them spoils the story."),
        field('goal', 'Goal', area('goal', v.goal, max.goal, 2)),
        field('secret', 'Secret', area('secret', v.secret, max.secret, 3))),
      el('p', { class: 'err', role: 'alert' }, editing.error || ''),
      el('div', { class: 'pedit-actions' },
        el('button', { type: 'button', class: 'btn primary pedit-save', disabled: !!actBlock(), title: actBlock() || null, onclick: () => saveEdit() }, 'Save'),
        el('button', { type: 'button', class: 'btn pedit-cancel', onclick: () => cancelEdit() }, 'Cancel')));
  }
  /* What is typed in an editor form. */
  function readForm(form) {
    const val = k => { const x = form.querySelector(`[name="${k}"]`); return x ? x.value : ''; };
    const was = (editing.draft || editing.base).memories;
    const st = form.querySelector('input[name="status"]:checked');
    const hidden = $('.pedit-hidden', form);
    const prev = editing.draft || editing.base;
    const num = (k, dflt) => { const x = form.querySelector(`[name="${k}"]`); if (!x) return dflt; const v = parseInt(x.value, 10); return Number.isFinite(v) ? v : dflt; };
    const baseRel = isObj(prev.rel) ? prev.rel : { t: 0, f: 0, k: 0, s: 0, m: 0, owed: 0 };
    return {
      name: val('name'), age: val('age'), pronouns: val('pronouns'), role: val('role'), look: val('look'), voice: val('voice'), history: val('history'),
      traits: [0, 1, 2].map(i => val('trait' + i)), attitude: parseInt(val('attitude'), 10) || 0,
      rel: { t: num('trust', baseRel.t), f: num('fear', baseRel.f), k: num('knows', baseRel.k), s: num('spark', baseRel.s), m: num('romance', baseRel.m), owed: num('owed', baseRel.owed) },
      relTo: val('relTo'), relation: val('relation'), home: val('home'), status: st ? st.value : editing.base.status,
      // Every field the memory had, with the words and weight as typed (wave 30: a new one also says what it was).
      memories: $$('.pedit-mem', form).map(row => {
        const m = was[+row.dataset.i] || {};
        const ev = $('[data-mem="event"]', row);
        return Object.assign(deepCopy(m), { model: m.model === true, text: $('[data-mem="text"]', row).value, weight: parseInt($('[data-mem="weight"]', row).value, 10) || 1 }, ev ? { event: ev.value } : {});
      }),
      leverage: prev.leverage || [], voidLeverage: (prev.voidLeverage || []).slice(),
      goal: val('goal'), secret: val('secret'), hiddenOpen: !!(hidden && hidden.open), moreOpen: !!($('.pedit-more', form) || {}).open
    };
  }
  /* A new memory as the engine keeps it (wave 30): noted moves nothing; any
     other kind carries the table's change for it (d) and how long it
     lasts, so the card gives it as a reason. */
  function newMemory(m) {
    const out = { turn: m.turn, text: m.text, weight: m.weight };
    if (Number.isInteger(m.day)) out.day = m.day;
    if (m.model) out.model = true;
    const row = Rel.EVENTS[m.event];
    if (!row || m.event === 'noted') return Object.assign(out, { event: 'noted', d: null });
    const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return Object.assign(out, { event: m.event, d: { w: n(row.w), t: n(row.t), f: n(row.f), k: n(row.k), s: 0, m: 0 }, decay: row.decay, key: `m${m.turn}-edit` });
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
    // Wave 30: the other tracks set (trust, fear, knows; spark and romance only for an eligible adult; wave 35: owed), each only when it changed.
    const vr = isObj(v.rel) ? v.rel : {};
    const br = isObj(base.rel) ? base.rel : {};
    const rel = {};
    for (const x of ['t', 'f', 'k', 's', 'm', 'owed']) if (Number.isInteger(vr[x]) && vr[x] !== br[x]) rel[x] = vr[x];
    if (Object.keys(rel).length) out.rel = rel;
    if (v.relTo !== base.relTo) out.relationToNpcId = v.relTo || null;
    if (v.relTo && v.relation !== base.relation) out.relation = v.relation;
    if (v.home !== base.home) out.homeLocationId = v.home || null;
    if (v.status !== base.status) out.status = v.status;
    // A memory left empty (a new one never written, or one cleared) is dropped; the rest keep every field they had (wave 30: day and act too).
    const mems = list => list.filter(m => String(m.text || '').trim()).map(m => {
      if (m.isNew) return newMemory(m);
      const o = deepCopy(m);
      delete o.isNew;
      if (!o.model) delete o.model;
      return o;
    });
    const key = list => JSON.stringify(list.map(m => [m.turn, String(m.text).trim(), m.weight, m.isNew ? m.event : null]));
    if (key(v.memories.filter(m => String(m.text || '').trim())) !== key(base.memories.filter(m => String(m.text || '').trim()))) out.memories = mems(v.memories);
    if (Array.isArray(v.voidLeverage) && v.voidLeverage.length) out.voidLeverage = v.voidLeverage.slice();
    return out;
  }
  /* Delete a line of what is held between them (wave 30): it is voided on Save. */
  function editLeverage(id) {
    const form = editing && $('.pedit', d.panelBody);
    if (!form) return;
    editing.draft = readForm(form);
    if (!editing.draft.voidLeverage.includes(id)) editing.draft.voidLeverage.push(id);
    const fresh = editForm(State.current, State.npc(editing.id));
    form.replaceWith(fresh);
    const b = $('.pedit-lev-del', fresh) || $('.pedit-save', fresh);
    if (b) b.focus();
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
    if (!canAct({ say: true })) return false;
    editing = { id, base: editBase(n), draft: null, error: '' };
    openPerson = id;
    renderPanel();
    const form = $('.pedit', d.panelBody);
    if (form) {
      // A phone: the form itself takes the focus (a screen reader hears "Edit …"; no keyboard pops up over it).
      if (!isMobile()) $('[name="name"]', form).focus({ preventScroll: true }); else form.focus({ preventScroll: true });
      const card = form.closest('.pcard');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }
    return true;
  }
  /* The editor's Save bar sticks to the bottom of the panel: a field that
     takes the focus (or stays focused while the keyboard comes up) is
     scrolled up so it sits above the bar. */
  function keepFieldClear() {
    const f = document.activeElement;
    if (!editing || !f || !d.panelBody.contains(f) || !f.closest('.pedit') || f.classList.contains('pedit')) return false;
    const bar = $('.pedit-actions', d.panelBody);
    if (!bar || bar.contains(f)) return false;
    const r = f.getBoundingClientRect();
    const top = d.panelBody.getBoundingClientRect().top;
    const limit = Math.min(bar.getBoundingClientRect().top, window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight) - 8;
    if (r.bottom > limit) d.panelBody.scrollTop += Math.min(r.bottom - limit, r.top - top - 8);
    else if (r.top < top + 8) d.panelBody.scrollTop -= top + 8 - r.top;
    return true;
  }
  /* /edit <name> (UI.editPerson): the People panel, with that person's card
     open in edit mode. false when they have no card or a turn is running. */
  function editPersonFromCommand(id) {
    const s = State.current;
    const n = s && State.npc(id);
    if (!n || !hasCard(s, n)) return false;
    if (!canAct({ say: true })) return false;
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
    if (!canAct({ say: true })) return { ok: false, reason: Storage.readOnly ? 'read-only' : 'busy' };
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
  /* A place the player has only heard of: told about, never visited. */
  function heardOf(l) { return !!l && isObj(l.revealed) && !l.revealed.visited; }
  /* Closed now (shut for good, or on today's weekday). */
  function closedNow(l) { return !!l && State.isClosed(l); }
  /* The day a ban from this place ends, or null. */
  function bannedUntil(s, l) {
    if (!l) return null;
    const day = s.time.day;
    const ban = (Array.isArray(s.bans) ? s.bans : []).filter(b => isObj(b) && b.locationId === l.id && b.untilDay > day).sort((a, b) => b.untilDay - a.untilDay)[0];
    // The first day it is open again (wave 12, L9), as every other line about the ban says.
    return ban ? Pipeline.banBackDay(ban) : null;
  }
  /* "Closed Sundays", "Closed Sundays and Mondays". */
  function closedDays(l) { return Array.isArray(l.closedOn) ? l.closedOn.filter(x => typeof x === 'string' && x) : []; }
  function closedOnLine(l) {
    const days = closedDays(l);
    return days.length ? `Closed ${joinList(days.map(x => x + 's'))}` : '';
  }
  /* A place's hours, with the days it is shut added only when the hours do not already name them. */
  function hoursLine(l) {
    const hours = typeof l.hours === 'string' ? l.hours.trim() : '';
    const left = closedDays(l).filter(day => !new RegExp(`\\b${reEsc(day)}s?\\b`, 'i').test(hours));
    return [hours, left.length ? `Closed ${joinList(left.map(x => x + 's'))}` : ''].filter(Boolean).join(' · ');
  }
  /* A place's type as a player would say it, for the place here and each
     place's row (one map for both): the town's own type ids ('gas',
     'trailerpark', 'bighouse') are not words. An id not listed reads as
     itself, spaced. */
  const PLACE_TYPE_LABELS = {
    gas: 'Gas station', bar: 'Bar', tavern: 'Tavern', motel: 'Motel', church: 'Church', police: 'Police station', watch: 'Watch house',
    pawn: 'Pawn shop', trailerpark: 'Trailer park', trailer: 'Trailer', marina: 'Boat landing', docks: 'Docks', dock: 'Dock', landing: 'Landing',
    bighouse: 'Big house', house: 'House', home: 'Home', apartment: 'Apartment', cabin: 'Cabin', farm: 'Farm', fields: 'Farmland', woods: 'Woods',
    bridge: 'Bridge', street: 'Street', road: 'Road', highway: 'Highway', parking: 'Parking lot', cemetery: 'Cemetery', tower: 'Water tower',
    office: 'Office', care: 'Care home', school: 'School', hospital: 'Hospital', clinic: 'Clinic', prison: 'Prison', mill: 'Mill',
    town: 'Town', city: 'City', county: 'County', coast: 'Coast', slum: 'Slum', market: 'Market', shop: 'Shop', store: 'Store',
    garage: 'Garage', diner: 'Diner', ramp: 'Boat ramp', riverbank: 'Riverbank', wharf: 'Wharf', pier: 'Pier'
  };
  function placeTypeLabel(type) {
    const t = String(type || '').trim().toLowerCase();
    if (!t) return 'Place';
    return PLACE_TYPE_LABELS[t] || capFirst(t.replace(/[_-]+/g, ' '));
  }
  /* A place that its type word would misname gets its own: the Bluff is a
     pull-off on the highway, not the highway (the Bypass is); in a small
     town the police sit in Town Hall, which is no police station (another
     police place is). A typeLabel on the place in the town's data wins over
     both. */
  const PLACE_LABELS = { loc_bluff: 'Bluff', loc_town_hall: 'Town hall' };
  function placeLabel(l) {
    if (!l) return 'Place';
    if (typeof l.typeLabel === 'string' && l.typeLabel.trim()) return l.typeLabel.trim();
    return PLACE_LABELS[l.id] || placeTypeLabel(l.type);
  }
  /* " (closed)" for a place shut for good, " (closed today)" for one shut on today's weekday. */
  function closedTag(l) { return !closedNow(l) ? '' : l.closed === true ? ' (closed)' : ' (closed today)'; }
  /* The line under the name of the place here: its type, and shut for good, today, or on which days. */
  function placeStatusLine(l) {
    const days = closedDays(l);
    const shut = l.closed === true ? 'Closed' : closedNow(l) ? `Closed today${days.length ? ` (${joinList(days.map(x => x + 's'))})` : ''}` : closedOnLine(l);
    return [placeLabel(l), shut].filter(Boolean).join(' · ');
  }
  // ----- Places: label placement -----
  /* Two boxes ({ x, y, w, h }) overlap. */
  function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  /* How many of the boxes a box would hide: the map labels and the "Go to" chip both pick the spot that hides fewest. */
  function hides(box, rects) { let n = 0; for (const r of rects) if (overlaps(box, r)) n++; return n; }
  /* The spots a label tries: the place's own anchor from the town's map
     first, then the four sides, the four corners, and the sides again with
     the block slid along them (n and s: starting or ending at the marker;
     e and w: rising from it or hanging below it). */
  const LABEL_TRY = ['n', 's', 'e', 'w', 'ne', 'se', 'nw', 'sw', 'n<', 'n>', 's<', 's>', 'e^', 'ev', 'w^', 'wv']
    .reduce((all, a) => all.concat(a.length === 2 && /[ew]$/.test(a) && /^[ns]/.test(a) ? [a] : [a, a + '.']), []); // '.': a little closer to the marker
  /* How wide a label is, in viewBox units at font size fs: measured with
     the map's own font (an estimate if there is no canvas). */
  let measureCtx = null;
  const measured = new Map();
  function textWidth(text, fs, bold) {
    const key = `${bold ? 'b' : ''}${fs}|${text}`;
    if (measured.has(key)) return measured.get(key);
    let w = text.length * fs * 0.58;
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = `${bold ? '600 ' : ''}${fs}px ${getComputedStyle(document.body).fontFamily}`;
      const m = measureCtx.measureText(text).width;
      if (m > 0) w = m;
    } catch (e) { /* the estimate stands */ }
    measured.set(key, w);
    return w;
  }
  /* A place's label block (its label lines, then the people seen there) at
     one spot, in viewBox units, kept inside the map. */
  function labelLayout(L, p, u, anchor) {
    const lines = p.lines;
    const textW = Math.max(...lines.map(t => textWidth(t, u.fs, p.bold)));
    const blockW = Math.max(textW, p.rowW);
    const blockH = lines.length * u.lh + (p.shown ? u.mono + 3 : 0);
    const side = anchor.charAt(0);
    const close = anchor.endsWith('.');
    const mod = anchor.slice(1).replace('.', '');
    const corner = mod === 'e' || mod === 'w';
    const gap = close ? 8 : 11;
    let align;
    let x0;
    let top;
    if (side === 'n' || side === 's') {
      align = corner ? (mod === 'e' ? 'start' : 'end') : mod === '<' ? 'end' : mod === '>' ? 'start' : 'middle';
      x0 = corner ? p.x + (mod === 'e' ? 6 : -6) : mod === '<' ? p.x + 8 : mod === '>' ? p.x - 8 : p.x;
      const off = corner ? 7 : gap;
      top = side === 'n' ? p.y - off - blockH : p.y + off;
    } else {
      align = side === 'e' ? 'start' : 'end';
      x0 = side === 'e' ? p.x + gap : p.x - gap;
      top = mod === '^' ? p.y + u.lh / 2 - blockH : mod === 'v' ? p.y - u.lh / 2 + 1 : p.y - (lines.length * u.lh) / 2;
    }
    const leftOf = x => (align === 'start' ? x : align === 'end' ? x - blockW : x - blockW / 2);
    x0 += clamp(leftOf(x0), 3, L.W - 3 - blockW) - leftOf(x0);
    top = clamp(top, 2, L.H - 2 - blockH);
    return { anchor, align, x0, top, blockW, blockH, box: { x: leftOf(x0) - 0.5, y: top - 0.5, w: blockW + 1, h: blockH + 1 } };
  }
  /* Each label goes where it hides the fewest markers and other labels
     (hides()): first one by one (the current place, then the busiest, then
     top to bottom), then a few rounds in which any label still hiding
     something moves if another spot hides less, now that all are placed. */
  function placeLabels(L, people, u, s) {
    // Each marker as mapGlyph draws it: a 14 by 10 wedge, a 10 by 10 square, a 13 by 13 house.
    const marks = L.pts.map(p => {
      const t = p.loc.type;
      const [w, h, dy] = MAP_WEDGE.includes(t) ? [14, 10, 0] : MAP_SQUARE.includes(t) ? [10, 10, 0] : [13, 13, -0.5];
      return { x: p.x - w / 2, y: p.y - h / 2 + dy, w, h, id: p.id };
    });
    for (const p of L.pts) {
      const list = people[p.id] || [];
      p.shown = Math.min(3, list.length);
      p.bold = p.id === s.player.locationId;
      const more = list.length > 3 ? `+${list.length - 3}` : '';
      p.rowW = p.shown ? p.shown * u.mono + (p.shown - 1) * 2 + (more ? 3 + more.length * u.fs * 0.6 : 0) : 0;
      p.lab = null;
    }
    const first = L.pts.slice().sort((a, b) => ((b.id === s.player.locationId) - (a.id === s.player.locationId)) || (b.shown - a.shown) || (a.y - b.y));
    const costOf = (box, others) => hides(box, marks) + hides(box, others);
    const bestFor = (p, others) => {
      const tries = [p.anchor].concat(LABEL_TRY.filter(x => x !== p.anchor));
      let best = null;
      for (const a of tries) {
        const lay = labelLayout(L, p, u, a);
        // Its own marker counts too: a label pushed back over it by the map's edge is no good.
        const cost = costOf(lay.box, others);
        if (!best || cost < best.cost) best = Object.assign(lay, { cost });
        if (cost === 0) break;
      }
      return best;
    };
    /* One go from one order: place each, then up to six rounds of moving any
       label that still hides something to a spot that hides less. Returns
       how much is hidden in the end, and where everything went. */
    const attempt = order => {
      const lab = new Map();
      const othersOf = p => { const out = []; for (const q of order) if (q !== p && lab.has(q)) out.push(lab.get(q).box); return out; };
      for (const p of order) lab.set(p, bestFor(p, othersOf(p)));
      for (let round = 0; round < 6; round++) {
        let moved = false;
        for (const p of order) {
          const others = othersOf(p);
          const now = costOf(lab.get(p).box, others);
          if (now === 0) continue;
          const best = bestFor(p, others);
          if (best.cost < now) { lab.set(p, best); moved = true; }
        }
        if (!moved) break;
      }
      let total = 0;
      for (const p of order) total += hides(lab.get(p).box, marks) + hides(lab.get(p).box, othersOf(p)) / 2;
      return { total, lab };
    };
    // A few orders (the current place first, then reversed, left to right, right to left, bottom up); the one that hides least wins.
    const orders = [first, first.slice().reverse(), L.pts.slice().sort((a, b) => a.x - b.x), L.pts.slice().sort((a, b) => b.x - a.x), L.pts.slice().sort((a, b) => b.y - a.y)];
    let best = null;
    for (const o of orders) {
      const r = attempt(o);
      if (!best || r.total < best.total) best = r;
      if (best.total === 0) break;
    }
    for (const p of L.pts) p.lab = best.lab.get(p);
  }
  /* One place: the hit area (44px or more on screen), the ring and a bold
     label if the player is here, the marker, a strike if closed, then the
     label block: the label and the people seen there. */
  function mapPlace(s, L, p, people, u) {
    const here = p.id === s.player.locationId;
    const closed = closedNow(p.loc);
    const heard = heardOf(p.loc) && !here;
    const shown = people.slice(0, 3);
    const extra = people.length - shown.length;
    const kids = [sv('rect', { class: 'map-hit', x: r1(p.x - u.hit / 2), y: r1(p.y - u.hit / 2), width: u.hit, height: u.hit, rx: 8 })];
    if (here) kids.push(sv('circle', { class: 'map-ring', cx: r1(p.x), cy: r1(p.y), r: 11.5 }));
    kids.push(mapGlyph(p));
    if (closed) kids.push(sv('line', { class: 'map-strike', x1: r1(p.x - 9), y1: r1(p.y + 8), x2: r1(p.x + 9), y2: r1(p.y - 8) }));
    const lab = p.lab || labelLayout(L, p, u, p.anchor);
    const { align, x0, top } = lab;
    p.lines.forEach((t, i) => kids.push(sv('text', { class: 'map-label' + (closed ? ' struck' : ''), x: r1(x0), y: r1(top + i * u.lh + u.fs * 0.84), 'text-anchor': align }, t)));
    const more = extra > 0 ? `+${extra}` : '';
    if (shown.length) {
      const rowW = p.rowW;
      const cy = top + p.lines.length * u.lh + 1.5 + u.mono / 2;
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
    // Shut for good or only today, as the exits and the chip say it ("closed today").
    const shut = closed ? closedTag(p.loc).trim().replace(/^\(|\)$/g, '') : null;
    const aria = [p.loc.name, here ? 'you are here' : null, heard ? 'heard of, not visited yet' : null, shut, who.length ? 'with ' + who.join(', ') : null].filter(Boolean).join(', ');
    const tap = e => { if (e) e.stopPropagation(); mapTap(p.id, false); };
    return sv('g', {
      class: 'map-place', role: 'button', tabindex: '0', 'aria-label': aria, 'aria-current': here ? 'location' : null, 'aria-disabled': here ? 'true' : null,
      dataset: { loc: p.id, here: here ? '1' : '0', closed: closed ? '1' : '0', heard: heard ? '1' : '0', picked: mapPick === p.id ? '1' : '0', glyph: kids[here ? 2 : 1].getAttribute('data-glyph'), anchor: lab.anchor },
      onclick: tap,
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); mapTap(p.id, true); } }
    }, kids);
  }
  /* Game.UI.renderMap(): the map node (a div holding the SVG and, when a
     place is picked, its chip). "Expand map" (phone and laptop) opens it as
     a modal view over everything, larger than in the panel: on a phone it
     fills the height and pans sideways, on a laptop it fits the window
     (mapExpanded, memory only; Close map or Escape). */
  let mapExpanded = false;
  /* The expanded map's size (W by H viewBox units): it fills the view below
     the bar on both axes, so the land, the river and the roads run to the
     edges, and pans along whichever axis it is larger on. A phone covers
     the view (upright it fills the height and pans sideways; on its side it
     fills the width and pans up and down); a laptop fits the whole town in
     the window (and is never smaller than 1.6 times the panel's map), with
     land beyond it. w, h: the canvas in CSS px; scale: px per unit; vb:
     the viewBox, the town's frame grown to the canvas and centred on it. */
  const MAP_BAR = 57; // the bar (56) and its rule
  function expandedSize(W, H) {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight - MAP_BAR);
    const fit = Math.min(vw / W, vh / H);
    const cover = Math.max(vw / W, vh / H);
    const scale = isMobile() ? cover : Math.max(fit, 1.6 * 316 / W);
    const w = Math.max(vw, Math.round(W * scale));
    const h = Math.max(vh, Math.round(H * scale));
    const r2 = n => Math.round(n * 100) / 100;
    return { w, h, scale, vb: { x: r2((W - w / scale) / 2), y: r2((H - h / scale) / 2), w: r2(w / scale), h: r2(h / scale) } };
  }
  /* A line that ends on the town's frame (the river, a road off the map)
     runs on past it, straight along the tangent at its end, by reach units:
     the expanded map has land beyond the frame, and nothing stops dead
     there. One path, not a piece laid against it: the run-on starts the
     path (its first move becomes a line to the same point) and ends it, so
     no seam or kink shows where they meet. A path that does not start with
     an absolute move, or that closes, gets separate pieces that overlap its
     ends by 3 units, which hides the join as well. */
  function runOn(dPath, L, reach) {
    let p = null;
    let len = 0;
    try { p = sv('path', { d: dPath }); len = p.getTotalLength(); } catch (e) { return dPath; }
    if (!(len > 2) || !(reach > 0)) return dPath;
    const edge = q => q.x <= 0.5 || q.y <= 0.5 || q.x >= L.W - 0.5 || q.y >= L.H - 0.5;
    // The point reach units on from end a, away from b (a point just inside the line, so a-b is its tangent there).
    const past = (a, b, by) => { const dx = a.x - b.x; const dy = a.y - b.y; const n = Math.hypot(dx, dy) || 1; return { x: a.x + dx / n * by, y: a.y + dy / n * by }; };
    const xy = q => `${r1(q.x)},${r1(q.y)}`;
    const d0 = String(dPath).trim();
    const joinable = /^M\s*[-+.\d]/.test(d0) && !/[zZ]\s*$/.test(d0);
    let head = '';
    let tail = '';
    try {
      const a = p.getPointAtLength(0);
      const b = p.getPointAtLength(len);
      const ta = p.getPointAtLength(Math.min(len, 0.25));
      const tb = p.getPointAtLength(Math.max(0, len - 0.25));
      if (joinable) {
        // "M far L a" then the path with its first move as a line: one continuous stroke.
        if (edge(a)) head = `M${xy(past(a, ta, reach))} L`;
        if (edge(b)) tail = ` L${xy(past(b, tb, reach))}`;
        return head ? head + d0.replace(/^M\s*/, '') + tail : d0 + tail;
      }
      // Overlapping pieces: each runs back 3 units inside the line, so no hairline shows at the join.
      if (edge(a)) head = `M${xy(past(a, ta, reach))} L${xy(past(a, ta, -3))} `;
      if (edge(b)) tail = ` M${xy(past(b, tb, -3))} L${xy(past(b, tb, reach))}`;
    } catch (e) { return dPath; }
    return head + d0 + tail;
  }
  function renderMap(s) {
    s = s || State.current;
    if (!s) return null;
    const L = mapLayout(s);
    const m = L.m;
    if (mapPick && (mapPick === s.player.locationId || !L.byId[mapPick])) mapPick = null;
    // Sizes in viewBox units, so labels are 11px or more on a map 316px wide
    // (the laptop panel is 319, a 375px phone's sheet 375) and taps hit 44px.
    // Expanded, the map is drawn larger: labels 14px on screen, so there is more room between them.
    const big = mapExpanded ? expandedSize(L.W, L.H) : null;
    const k = big ? 1 / big.scale : L.W / 316;
    // The viewBox: the town's frame, grown to the canvas when expanded (lines that end on the frame run on).
    const vb = big ? big.vb : { x: 0, y: 0, w: L.W, h: L.H };
    const reach = big ? Math.max(-vb.x, -vb.y, 0) + 20 : 0;
    const far = d => (reach > 20 ? runOn(d, L, reach) : d);
    const u = big ? { fs: r1(14 * k), lh: r1(16.8 * k), hit: Math.ceil(44 * k), mono: r1(17 * k) } : { fs: r1(11 * k), lh: r1(13.2 * k), hit: Math.ceil(44 * k), mono: r1(14 * k) };
    const people = mapPeople(s);
    placeLabels(L, people, u, s);
    const rw = L.rw;
    const text = (cls, o) => (isObj(o) && typeof o.text === 'string' && Number.isFinite(o.x) && Number.isFinite(o.y)
      ? sv('text', { class: cls, x: o.x, y: o.y, 'text-anchor': ['start', 'middle', 'end'].includes(o.anchor) ? o.anchor : 'middle', transform: Number.isFinite(o.rotate) ? `rotate(${o.rotate} ${o.x} ${o.y})` : null }, cleanText(o.text, 40))
      : null);
    const paths = v => (Array.isArray(v) ? v : []).filter(d => typeof d === 'string' && d.trim());
    const svg = sv('svg', {
      class: 'map-svg', viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`, role: 'group', 'aria-label': `Map of ${s.meta.townName}`, 'font-size': u.fs,
      onclick: () => { if (mapPick) setPick(null); }
    },
    sv('rect', { class: 'map-land', x: vb.x, y: vb.y, width: vb.w, height: vb.h }),
    L.river ? [
      sv('path', { class: 'map-bank', d: far(L.river), 'stroke-width': rw + 5, 'aria-hidden': 'true' }),
      sv('path', { class: 'map-water', d: far(L.river), 'stroke-width': rw, 'aria-hidden': 'true' })] : null,
    sv('g', { class: 'map-roads', 'aria-hidden': 'true' },
      paths(m.roads).map(d => sv('path', { class: 'map-road deco', d: far(d) })),
      L.roads.map(r => sv('path', { class: 'map-road', d: r.d, dataset: { road: r.key } }))),
    paths(m.bridges).map(d => sv('g', { class: 'map-bridge', 'aria-hidden': 'true' }, sv('path', { class: 'map-bridge-rail', d }), sv('path', { class: 'map-bridge-deck', d }))),
    sv('g', { 'aria-hidden': 'true' }, text('map-river-label', m.riverLabel), (Array.isArray(m.labels) ? m.labels : []).map(o => text('map-area', o))),
    L.pts.map(p => mapPlace(s, L, p, people[p.id] || [], u)));
    const pick = mapPick ? L.byId[mapPick] : null;
    const chip = pick ? el('button', {
      type: 'button', class: 'map-go', disabled: !!actBlock(),
      dataset: { loc: pick.id, side: pick.y < L.H * 0.55 ? 'below' : 'above', fx: String((pick.x - vb.x) / vb.w) },
      style: `left:${r1((pick.x - vb.x) / vb.w * 100)}%;top:${r1((pick.y - vb.y) / vb.h * 100)}%`,
      onclick: e => { e.stopPropagation(); confirmTravel(null, e.currentTarget); },
      onkeydown: e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPick(null, pick.id); } }
    }, `Go to ${placePhrase(pick.loc.name)}${closedTag(pick.loc)}?`) : null;
    const bar = mapExpanded ? el('div', { class: 'map-bar' },
      el('h2', { id: 'map-title' }, `Map of ${s.meta.townName}`),
      el('button', { type: 'button', class: 'btn small map-close', onclick: e => { e.stopPropagation(); setMapExpanded(false); } }, 'Close map')) : null;
    const canvas = el('div', { class: 'map-canvas', style: big ? `width:${big.w}px;height:${big.h}px` : null }, svg, chip);
    return el('div', {
      class: 'map' + (mapExpanded ? ' expanded' : ''), dataset: { pick: mapPick || '' },
      role: mapExpanded ? 'dialog' : null, 'aria-labelledby': mapExpanded ? 'map-title' : null, 'aria-modal': mapExpanded ? 'true' : null,
      onkeydown: mapExpanded ? trapMapFocus : null
    }, bar, el('div', { class: 'map-pan', onfocusin: mapExpanded ? keepFocusInView : null }, canvas));
  }
  /* The expanded map pans: a place reached with Tab is scrolled into view
     (an SVG mark is not scrolled to by the browser on focus). */
  function keepFocusInView(e) {
    const pan = e.currentTarget;
    const t = e.target && e.target.closest ? e.target.closest('.map-place') : null;
    if (!pan || !t) return;
    const pr = pan.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    const pad = 24;
    if (r.left < pr.left + pad) pan.scrollLeft -= pr.left + pad - r.left;
    else if (r.right > pr.right - pad) pan.scrollLeft += r.right - (pr.right - pad);
    if (r.top < pr.top + pad) pan.scrollTop -= pr.top + pad - r.top;
    else if (r.bottom > pr.bottom - pad) pan.scrollTop += r.bottom - (pr.bottom - pad);
  }
  /* The expanded map is modal: Tab and Shift+Tab go round inside it. */
  function trapMapFocus(e) {
    if (e.key !== 'Tab' || !mapExpanded) return;
    const box = e.currentTarget;
    const list = $$('button:not([disabled]), [tabindex="0"]', box).filter(x => x.getClientRects().length);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
    else if (!e.shiftKey && (i === list.length - 1 || i < 0)) { e.preventDefault(); list[0].focus(); }
  }
  /* While the map is expanded nothing else on the page takes the focus or
     a tap: the story, the bars, the panel's tabs and the rest of the panel
     are inert. Closed again, the phone sheet stays modal if it is open. */
  function syncMapModal() {
    const on = mapExpanded && !!d.panelBody && !!$('.map.expanded', d.panelBody);
    const sheet = isMobile() && d.gameBody.classList.contains('sheet-open');
    for (const node of [$('.story', d.gameBody), $('#screen-game .topbar'), d.demoBar, d.tabBar]) if (node) node.inert = on || sheet;
    const head = $('.panel-head', d.panel);
    if (head) head.inert = on;
    for (const kid of d.panelBody ? d.panelBody.children : []) if (!kid.classList.contains('map')) kid.inert = on;
    syncBanner();
  }
  /* Expand map (and back): the close button takes the focus, and the map
     pans to the player (phone); closed, the focus goes back to Expand map. */
  function setMapExpanded(on) {
    const want = !!on && tab === 'places' && !!State.current && !State.muted && screen === 'game';
    if (want === mapExpanded) return mapExpanded;
    mapExpanded = want;
    if (!d.panelBody || d.panelBody.dataset.tab !== 'places') { syncMapModal(); return mapExpanded; }
    const was = document.activeElement;
    refreshMap(mapExpanded ? 'close' : null);
    syncMapModal();
    if (mapExpanded) panMapTo(State.current.player.locationId);
    else { const f = $('.map-expand', d.panelBody); if (f) moveFocus(f, was); }
    return mapExpanded;
  }
  /* Scroll the expanded map so a place sits in the middle of the view. */
  function panMapTo(id) {
    const pan = d.panelBody ? $('.map.expanded .map-pan', d.panelBody) : null;
    const g = pan && $(`.map-place[data-loc="${CSS.escape(id)}"] .map-mark`, pan);
    if (!g) return;
    const pr = pan.getBoundingClientRect();
    const r = g.getBoundingClientRect();
    pan.scrollLeft += r.left + r.width / 2 - (pr.left + pr.width / 2);
    pan.scrollTop += r.top + r.height / 2 - (pr.top + pr.height / 2);
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
  function placeChip(map) {
    // The chip sits in the map's canvas (the SVG's own box, also when the map is expanded and pans).
    const node = map ? $('.map-canvas', map) || map : null;
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
    const others = $$('.map-mark, .map-label, .map-caption, .map-mono', node).filter(x => !mine || !mine.contains(x))
      .map(x => { const r = x.getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }; });
    const below = clamp(my + 16, 4, Math.max(4, h - ch - 4));
    const above = clamp(my - 16 - ch, 4, Math.max(4, h - ch - 4));
    const first = chip.dataset.side === 'above' ? [above, below] : [below, above];
    const at = top => hides({ x: left, y: top, w: cw, h: ch }, others);
    const top = at(first[1]) < at(first[0]) ? first[1] : first[0];
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
    // An expanded map keeps where it was panned to; the focus stays where it was when nothing else is asked for.
    const oldPan = $('.map-pan', old);
    const at = oldPan ? [oldPan.scrollLeft, oldPan.scrollTop] : null;
    const had = old.contains(document.activeElement) ? document.activeElement : null;
    const fresh = renderMap(State.current);
    old.replaceWith(fresh);
    const pan = $('.map-pan', fresh);
    if (at && pan && mapExpanded && old.classList.contains('expanded')) { pan.scrollLeft = at[0]; pan.scrollTop = at[1]; }
    placeChip(fresh);
    let f = focus === 'chip' ? $('.map-go', fresh) : focus === 'close' ? $('.map-close', fresh) : focus ? $(`.map-place[data-loc="${CSS.escape(focus)}"]`, fresh) : null;
    if (!f && had) f = had.classList.contains('map-close') ? $('.map-close', fresh) : had.dataset.loc ? $(`.map-place[data-loc="${CSS.escape(had.dataset.loc)}"]`, fresh) : null;
    if (!f && had) f = mapExpanded ? $('.map-close', fresh) : $('.map-expand', d.panelBody);
    // The chip that started a walk gives the focus to its place's marker, which holds it for the turn.
    if (f) moveFocus(f, had || document.activeElement);
    syncMapModal();
  }
  function setPick(id, focus) { mapPick = id; refreshMap(focus); }
  /* A tap (or Enter / Space) on a place: another place shows its chip (a
     second tap takes it away again); the current place, or any tap while a
     turn runs, does nothing. Returns whether a chip is showing. */
  function mapTap(id, viaKey) {
    const s = State.current;
    if (!s || State.muted || !canAct({ say: true })) return false;
    if (id === s.player.locationId) { if (mapPick) setPick(null, viaKey ? id : null); return false; }
    const next = mapPick === id ? null : id;
    setPick(next, viaKey ? (next ? 'chip' : id) : null);
    return !!next;
  }
  /* The chip, or a "Go there" button (a place's sheet, an exit): the Do turn
     "I head to <place>." On a phone the sheet closes so the walk can be
     read. A failed turn leaves the line in the box, like a typed one. */
  /* from: the control pressed (Go there, the chip). It holds the focus
     for the turn, or what stands in for it once it is gone (the place's
     marker, Expand map, on a phone the sheet's opener as the sheet closes);
     after, the box on a laptop, the opener (or its stand-in) on a phone. */
  async function confirmTravel(id, from) {
    const s = State.current;
    const target = typeof id === 'string' ? id : mapPick;
    const l = target && State.loc(target);
    if (!s || !l || l.id === s.player.locationId || l.away === true) return null;
    if (!canAct({ say: true })) return null;
    const line = `I head to ${placePhrase(l.name)}.`;
    const opener = from || document.activeElement;
    holdTurnFocus(opener && opener !== document.body ? opener : null);
    if (mapPick) setPick(null);
    setMapExpanded(false);
    if (isMobile()) closeSheet();
    let res = null;
    try { res = await Pipeline.submit(line, { mode: 'do', to: 'everyone' }); } catch (e) { console.error(e); res = { restoreInput: true }; }
    if (res && res.restoreInput && !d.cmd.value) { d.cmd.value = line; autosize(); syncSendLabel(); }
    releaseTurnFocus();
    return res;
  }
  /* A small "Go there" button (the exits, a place's sheet). */
  function goButton(s, l, cls) {
    if (!l || l.id === s.player.locationId || l.away === true) return null;
    const why = actBlock();
    return el('button', { type: 'button', class: 'btn small ' + (cls || ''), dataset: { go: l.id }, disabled: !!why, title: why || null, 'aria-label': `Go to ${placePhrase(l.name)}`, onclick: e => confirmTravel(l.id, e.currentTarget) }, 'Go there');
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
    const tag = l.away === true ? '' : `${l.id === here.id ? ' (here)' : ''}${heardOf(l) && l.id !== here.id ? ' (heard of)' : ''}${closedTag(l)}`;
    const id = 'plmore-' + l.id;
    const who = open ? placePeople(s, l) : null;
    const rows = [];
    const ban = open && l.away !== true ? bannedUntil(s, l) : null;
    if (open) {
      if (l.away === true && l.distance) rows.push(['How far', l.distance]);
      if (l.details) rows.push(['Inside', l.details]);
      if (hoursLine(l)) rows.push(['Hours', hoursLine(l)]);
      if (l.history) rows.push(['History', l.history]);
      if (who.lives.length) rows.push([l.away === true ? 'Lives there' : 'Lives here', joinList(who.lives)]);
      if (who.works.length) rows.push(['Works or regulars', joinList(who.works)]);
      if (who.buried.length) rows.push(['Buried here', joinList(who.buried)]);
      if (l.away !== true) rows.push(['Here now', who.now.length ? joinList(who.now) : 'Nobody right now']);
    }
    return el('article', { class: 'plcard' + (open ? ' open' : '') + (l.away === true ? ' away' : ''), dataset: { loc: l.id } },
      el('button', { type: 'button', class: 'plcard-head', id: 'plhead-' + l.id, 'aria-expanded': String(open), 'aria-controls': id, onclick: () => togglePlace(l.id) },
        el('span', { class: 'plcard-name' }, `${l.name}${tag}`),
        el('span', { class: 'plcard-type' }, placeLabel(l)),
        el('span', { class: 'pcard-chev', 'aria-hidden': 'true' })),
      el('div', { class: 'plcard-more', id, hidden: !open }, open ? [
        el('p', { class: 'plcard-desc' }, l.description),
        ban ? el('p', { class: 'plcard-warn', dataset: { banned: '1' } }, Number.isInteger(ban) ? `You are banned until Day ${ban}.` : 'You are banned from here.') : null,
        rows.length ? el('dl', { class: 'kv plcard-facts' }, rows.map(([k, v]) => [el('dt', null, k), el('dd', { dataset: { fact: k.toLowerCase().replace(/[^a-z]+/g, '-') } }, v)])) : null,
        goButton(s, l, 'go-btn')
      ] : null));
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
  /* "Day 5 · Evening" (with the weekday when the engine has one). */
  function dayLabel(day, phase) {
    if (!Number.isInteger(day)) return '';
    const wd = weekdayOf(day);
    return [`Day ${day}`, wd, phase ? capFirst(phase) : ''].filter(Boolean).join(' · ');
  }
  /* The day and phase a turn was played, from the log (an entry kept).
     Turn 0 is day 1; its phase only while the log still starts there. */
  function whenTurn(s, turn) {
    for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i].turn === turn) return { day: s.log[i].day, phase: s.log[i].phase };
    if (turn === 0) return { day: 1, phase: s.log.length && s.log[0].turn === 0 ? s.log[0].phase : null };
    return null;
  }
  /* "in 2 days", "tomorrow", "today", "overdue". */
  function dueIn(dueDay, day) {
    const n = dueDay - day;
    return n > 1 ? `${n} days` : n === 1 ? 'tomorrow' : n === 0 ? 'today' : 'overdue';
  }
  function obligationsOf(s) {
    return State.obligations().filter(o => isObj(o));
  }
  /* An obligation in the player's words: its own text, else from its kind. */
  function obligationText(o) {
    const n = o.npcId ? State.npc(o.npcId) : null;
    const who = n ? (n.knownToPlayer ? n.name : npcLabel(n)) : 'someone';
    const amount = Number.isInteger(o.amount) && o.amount > 0 ? (currency() ? money(o.amount) : `${o.amount} gold`) : '';
    if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
    switch (o.kind) {
      case 'debt': return `You owe ${who}${amount ? ' ' + amount : ''}`;
      case 'blackmail': return `${who} wants${amount ? ' ' + amount : ' paying'} to keep quiet`;
      case 'promise': return `You promised ${who} something`;
      case 'errand': return `Bring ${o.itemName || 'something'} to ${who}`;
      case 'lodging': return `A room${amount ? ' at ' + amount : ''} with ${who}`;
      default: return `You owe ${who}`;
    }
  }
  /* Who told the player a rumour: the name if known, else how they look. */
  function tellerOf(s, r) {
    const n = State.npc(r.heardFrom || r.sourceNpcId);
    return n ? (n.knownToPlayer || hasMet(s, n) ? n.name : npcLabel(n)) : '';
  }
  /* Town news the player has had (public, and not still waiting for the morning). */
  function newsOf() {
    return State.news.filter(x => isObj(x) && typeof x.text === 'string' && x.public !== false && x.seen !== false);
  }
  /* ----- Objectives (wave 26) -----
     The owner: "a side panel with something like 'Objectives' to track what
     people asked me to do, by when, and details about the objectives (that
     I know of)". Read from State on every draw: what people asked of the
     player in the story (State.asks), the meetings agreed (State.appointments),
     what they owe (State.obligations('owed')), the threads they know of and
     their open loose ends; newest first in each. Nothing here is editable:
     an entry leaves when the engine settles it (a seed fires, an obligation
     is met, a thread resolves). count: what someone is waiting on the player
     for (asks, meetings, owed), for the tab's label. */
  function objectivesOf(s) {
    const newest = (list, at) => list.map((x, i) => ({ x, i })).sort((a, b) => (at(b.x) - at(a.x)) || (b.i - a.i)).map(y => y.x);
    const seedTurn = id => { const sd = s.seeds.find(x => x.id === id); return sd && Number.isInteger(sd.turn) ? sd.turn : -1; };
    const asks = newest(State.asks(), a => (Number.isInteger(a.turn) ? a.turn : -1));
    const meetings = newest(State.appointments(), a => seedTurn(a.seedId));
    const owed = newest(State.obligations('owed').filter(isObj), o => (Number.isInteger(o.createdTurn) ? o.createdTurn : -1));
    const looseThreads = new Set((s.player.looseEnds || []).map(le => isObj(le) && le.threadId).filter(Boolean));
    const threads = s.threads.filter(t => t.status === 'open' && t.knownToPlayer && !looseThreads.has(t.id)).reverse();
    const loose = (s.player.looseEnds || []).filter(le => {
      if (!isObj(le)) return false;
      const t = le.threadId ? State.thread(le.threadId) : null;
      return !!State.npc(le.npcId) && (!t || t.status === 'open');
    }).reverse();
    return { asks, meetings, owed, threads, loose, count: asks.length + meetings.length + owed.length };
  }
  function objectiveCount() {
    const s = State.current;
    if (!s || State.muted) return 0;
    try { return objectivesOf(s).count; } catch (e) { console.error(e); return 0; }
  }
  /* The entries opened or shut by hand (memory only; renderPanel reads them before a redraw): by default open on a laptop, shut on a phone. */
  const objOpen = new Map();
  /* One entry: a summary that opens (who in bold and what, the when line,
     the stakes) and the details under it ([label, value] rows). */
  function objItem(o) {
    const open = objOpen.has(o.key) ? objOpen.get(o.key) : !isMobile();
    return el('li', { class: 'obj', dataset: { objective: o.key, kind: o.kind } },
      el('details', { class: 'obj-d', open },
        el('summary', { class: 'obj-sum', dataset: { objective: o.key } },
          el('span', { class: 'obj-text' }, o.who ? [el('strong', { class: 'obj-who' }, o.who), ' '] : null, o.text, o.gone ? el('span', { class: 'obj-gone' }, ' (no longer in town)') : null),
          o.when ? el('span', { class: 'obj-when' + (o.late ? ' late' : '') }, o.when) : null,
          o.stakes ? el('span', { class: 'obj-stakes' }, `Stakes: ${o.stakes}`) : null),
        el('dl', { class: 'kv obj-more' }, o.more.filter(r => r && r[1]).map(([k, v]) => [el('dt', null, k), el('dd', null, v)]))));
  }
  /* A chip that opens someone's card (as the Journal's threads); with no card for them, their name when the entry's own words
     name them (named: an ask, a meeting) or the player knows it, else how they would describe them. */
  function objPerson(s, n, named) {
    if (!n) return null;
    if (!hasCard(s, n)) return n.knownToPlayer || named ? n.name : npcLabel(n);
    return el('span', { class: 'jr-people' }, el('button', { type: 'button', class: 'chip', dataset: { npc: n.id }, onclick: () => showPerson(n.id) }, n.knownToPlayer ? n.name : npcLabel(n)));
  }
  /* When an ask was made: "Day 2 · Friday · Evening" (the turn's log entry),
     with that turn's journal line, else what the player did or said then. */
  function objAsked(s, turn) {
    if (!Number.isInteger(turn)) return null;
    const at = whenTurn(s, turn);
    const note = s.journal.filter(j => j && j.turn === turn).map(j => j.text).pop();
    const entry = s.log.find(e => e.turn === turn);
    const did = !note && entry && entry.input ? `You: ${cutText(entry.input, 140)}` : null;
    const when = at ? dayLabel(at.day, at.phase) : `Turn ${turn}`;
    return [when, note || did].filter(Boolean).join(' — ');
  }
  function cutText(t, n) { t = String(t || '').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; }
  const OBL_KIND = { debt: 'Debt', blackmail: 'Blackmail', promise: 'Promise', errand: 'Errand', lodging: 'Lodging' };
  function objSections(s) {
    const day = s.time.day;
    const all = objectivesOf(s);
    const wd = d => (weekdayOf(d) ? ` (${weekdayOf(d)})` : '');
    const due = d => { const n = d - day; return n > 1 ? `in ${n} days` : n === 1 ? 'due tomorrow' : n === 0 ? 'due today' : 'overdue'; };
    const firstPart = t => String(t || '').split(/\s*[;—]\s*/)[0].replace(/[.!]+$/, '');
    const asks = all.asks.map(a => {
      const n = a.npcId ? State.npc(a.npcId) : null;
      const sd = s.seeds.find(x => x.id === a.seedId);
      const late = a.dueIn === 'overdue';
      return objItem({ key: 'ask:' + a.seedId, kind: 'ask', who: a.name, text: firstPart(a.name ? a.what : a.said), gone: a.gone,
        when: [a.by, a.dueIn ? (a.dueIn === 'today' ? 'due today' : a.dueIn === 'tomorrow' ? 'due tomorrow' : a.dueIn) : null].filter(Boolean).join(' · '), late, stakes: a.reward,
        more: [['In full', a.said], ['Who', n ? objPerson(s, n, true) : null], ['Where', a.place ? capFirst(a.place) : null],
          ['When', Number.isInteger(a.dueDay) ? `Day ${a.dueDay}${wd(a.dueDay)}` : a.by ? capFirst(a.by) : null],
          ['Asked', sd ? objAsked(s, sd.turn) : null]] });
    });
    const meetings = all.meetings.map(a => {
      const sd = s.seeds.find(x => x.id === a.seedId);
      const ap = sd && isObj(sd.appointment) ? sd.appointment : null;
      const l = State.loc(a.locationId);
      return objItem({ key: 'meet:' + a.seedId, kind: 'meeting', who: a.name, text: `at ${a.place}, ${a.when}${a.detail ? ` (${a.detail})` : ''}`,
        more: [['In full', sd ? State.youWords(sd.effect) : null], ['Who', objPerson(s, State.npc(a.npcId), true)],
          ['Where', l ? `${l.name}${a.spot ? `, ${a.spot}` : ''}` : null],
          ['When', ap ? `Day ${ap.day}${wd(ap.day)}, ${(ap.phases || []).join(' or ')}${a.hour ? ` (${a.hour})` : ''}` : null],
          ['Agreed', sd ? objAsked(s, sd.turn) : null]] });
    });
    const owedIds = new Set(State.obligations('owed').map(o => o && o.id));
    const owed = all.owed.map(o => {
      const n = o.npcId ? State.npc(o.npcId) : null;
      const missed = o.status === 'missed' && owedIds.has(o.id);
      const d = Number.isInteger(o.dueDay) ? o.dueDay : null;
      const paid = Number.isInteger(o.amount) && o.amount > 0 && (o.paid | 0) > 0 ? `${money(o.paid)} paid` : null;
      const when = [d !== null ? `${missed ? 'was due' : 'by'} Day ${d}${wd(d)}` : null, missed ? 'missed, still owed' : d !== null ? due(d) : null, paid].filter(Boolean).join(' · ');
      return objItem({ key: 'owe:' + (o.id || ''), kind: 'owed', text: obligationText(o).replace(/[.]$/, ''), when, late: missed || (d !== null && d < day),
        more: [['Who', objPerson(s, n)], ['What', OBL_KIND[o.kind] || null],
          ['Amount', Number.isInteger(o.amount) && o.amount > 0 ? `${money(o.amount)}${paid ? `, ${money(o.paid)} of it paid` : ''}` : null],
          ['Thing', o.itemName || null], ['Due', d !== null ? `Day ${d}${wd(d)}` : null],
          ['Since', Number.isInteger(o.createdDay) ? `Day ${o.createdDay}${wd(o.createdDay)}` : null]] });
    });
    const threads = all.threads.map(t => {
      const met = (t.linkedIds || []).map(id => State.npc(id)).filter(n => n && hasCard(s, n));
      return objItem({ key: 'thread:' + t.id, kind: 'thread', who: t.title, text: t.summary ? sentenceOf(t.summary) : '',
        more: [['In full', t.summary || null], ['People', met.length ? el('span', { class: 'jr-people' }, met.map(n => el('button', { type: 'button', class: 'chip', dataset: { npc: n.id }, onclick: () => showPerson(n.id) }, n.knownToPlayer ? n.name : npcLabel(n)))) : null]] });
    });
    const loose = all.loose.map(le => {
      const n = State.npc(le.npcId);
      return objItem({ key: `loose:${le.kind}:${le.npcId}`, kind: 'loose', who: le.label || capFirst(le.kind || 'a loose end'), text: le.text || '',
        more: [['In full', le.text || null], ['Who', n && hasCard(s, n) ? objPerson(s, n) : null]] });
    });
    const sec = (key, title, items) => (items.length ? el('section', { class: 'jr-sec obj-sec', dataset: { section: key }, 'aria-label': title }, el('h3', null, title, el('span', { class: 'people-count' }, String(items.length))), el('ul', { class: 'obj-list' }, items)) : null);
    return { count: all.count, nodes: [sec('asks', 'Asked of you', asks), sec('meetings', 'Meetings', meetings), sec('owed', 'Owed', owed), sec('threads', 'Threads you know of', threads), sec('loose', 'Loose ends', loose)].filter(Boolean) };
  }
  // A thread's summary, its first sentence (the details have it all).
  function sentenceOf(t) { const m = /^(.+?[.!?])(\s|$)/.exec(String(t || '').trim()); return m ? m[1] : String(t || '').trim(); }
  /* Open someone's card from elsewhere (the Journal's threads). */
  function showPerson(id) {
    openPerson = id;
    tab = 'people';
    peopleQuery = '';
    renderPanel();
    if (isMobile() && !d.gameBody.classList.contains('sheet-open')) openSheet(); else if (!isMobile()) setCollapsed(false);
    const card = $(`.pcard[data-npc="${id}"]`, d.panelBody);
    if (card) {
      const group = card.closest('details');
      if (group) group.open = true;
      if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
      const head = $('.pcard-head', card);
      if (head) head.focus({ preventScroll: true });
    }
    return !!card;
  }
  /* The search box on the People tab hides the cards that do not match
     (every word, in the name, role or places), without a re-render. */
  function filterPeople() {
    const words = peopleQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const g of $$('.people-group', d.panelBody)) {
      let n = 0;
      for (const c of $$('.pcard', g)) {
        const hit = (!!editing && c.dataset.npc === editing.id) || words.every(w => (c.dataset.search || '').includes(w));
        c.hidden = !hit;
        if (hit) n++;
      }
      g.hidden = n === 0;
      if (g.tagName === 'DETAILS') {
        if (words.length && n) { if (!g.open) { g.open = true; g.dataset.auto = '1'; } }
        else if (!words.length && g.dataset.auto) { g.open = false; delete g.dataset.auto; }
      }
      shown += n;
    }
    const none = $('.people-none', d.panelBody);
    if (none) none.hidden = !words.length || shown > 0;
    return shown;
  }
  // Wave 30: the attitude key stays (a remembered sort survives), read as how they feel: liking, then trust.
  const SORTS = [['seen', 'Last seen'], ['attitude', 'How they feel'], ['name', 'Name']];
  /* A condition's effect as the sheet says it, the way Grown says "+1
     Wits": "-1 might" is "−1 Might", "-1 all" is "−1 to all". Anything
     else reads as written. */
  function effectText(effect) {
    const t = String(effect == null ? '' : effect).trim();
    const one = part => {
      const m = /^([+\-−])\s*(\d+)\s+(all|everything|[a-z]+)$/i.exec(part.trim());
      if (!m) return null;
      const what = m[3].toLowerCase();
      if (what !== 'all' && what !== 'everything' && !STATS.includes(what)) return null;
      return `${m[1] === '+' ? '+' : '−'}${m[2]} ${STATS.includes(what) ? capFirst(what) : 'to all'}`;
    };
    const parts = t.split(/\s*,\s*/).map(one);
    return t && parts.every(Boolean) ? parts.join(', ') : t;
  }
  /* Wave 28: the Debug view's export of the bookkeeper turns Pipeline kept
     (Pipeline.bookTurnsJsonl), saved as a .jsonl file for labelling. */
  function keepOn() { try { return Storage.settings().keepPackets === true; } catch (e) { return false; } }
  /* Wave 30: Debug's lines under a person: the axes and hard, the buckets
     (start, everyday, fix, today), each memory's kind and what it still
     carries, and the ask log. */
  function relDebug(s, n) {
    if (!isObj(n.rel)) return '';
    const r = n.rel;
    const ax = Rel.axesOf(n);
    const fmt = o => (isObj(o) ? Rel.TRACKS.filter(x => o[x] !== undefined).map(x => `${x} ${Math.round(Number(o[x]) * 100) / 100 || 0}`).join(' ') : '-');
    const left = m => { if (!isObj(m.d)) return ''; const q = Rel.remainder(m, n); return ` → now ${Rel.TRACKS.filter(x => q[x]).map(x => `${x} ${Math.round(q[x] * 10) / 10}`).join(' ') || 'nothing'}`; };
    return `\n  axes p ${ax.p} g ${ax.g} n ${ax.n} r ${ax.r}${ax.hard ? ' · hard' : ''}${ax.tough ? ' · tough' : ''}${ax.mercenary ? ' · mercenary' : ''}${r.migrated ? ` · version ${r.migrated}` : ''}`
      + `\n  start ${fmt(r.start)} · everyday ${fmt(r.everyday)} · fix ${fmt(r.fix)} · today ${isObj(r.today) ? `day ${r.today.day} ${JSON.stringify(r.today.ev || {})}` : '-'} · owed ${r.net | 0}`
      + `\n  kinds: ${(n.memories || []).map(m => `${Rel.debugMemory(m)}${left(m)}`).join(' | ') || '-'}`
      + `\n  asks: ${(Array.isArray(r.asks) ? r.asks : []).map(a => `t${a.turn} ${a.act}${a.ok === false ? ' (failed)' : ''}${a.confessed ? ' (confessed)' : ''}`).join(', ') || '-'}`;
  }
  function exportBookTurns() {
    if (!keepOn() || !Pipeline.bookTurns.length) return null;
    const day = new Date().toISOString().slice(0, 10);
    return Storage.download(Pipeline.bookTurnsJsonl(day), `bookkeeper-turns-${day}.jsonl`);
  }
  const PANELS = {
    character(s) {
      const p = s.player;
      const bg = BACKGROUNDS.find(b => b.id === p.backgroundId);
      const day = s.time.day;
      const facs = Object.keys(p.reputation || {});
      const progress = Array.isArray(p.progression) ? p.progression.filter(isObj) : [];
      const noSpend = p.storyPoints < 1 ? 'You have no story points' : actBlock({ fill: true });
      const spend = el('button', { type: 'button', class: 'btn small', id: 'sp-spend', disabled: !!noSpend, title: noSpend || 'Make something true: /fact', onclick: () => { if (!canAct({ fill: true, say: true })) return; if (isMobile()) closeSheet(true); fillBox('/fact '); } }, 'Spend');
      const condition = c => {
        const left = Number.isInteger(c.untilDay) ? c.untilDay - day : null;
        const when = left === null ? 'until you rest' : left > 1 ? `${left} days left` : left === 1 ? '1 day left' : 'ends today';
        return `${c.name}${c.effect ? ' (' + effectText(c.effect) + ')' : ''} · ${when}`;
      };
      return [
        // The age beside the name ("Tester · 34"), then the background and its blurb.
        el('h2', { class: 'char-name' }, p.name, ageText(p.age) ? el('span', { class: 'char-age', title: 'Age' }, ` · ${p.age}`) : null),
        el('p', { class: 'muted' }, p.background),
        bg && bg.blurb ? el('p', { class: 'char-blurb' }, bg.blurb) : null,
        el('div', { class: 'stat-grid' }, STATS.map(k => el('div', { class: 'stat' }, el('span', { class: 'stat-name' }, capFirst(k)), el('span', { class: 'stat-val', dataset: { stat: k } }, fmtMod(p.stats[k]))))),
        kv([['HP', `${p.hp} / ${p.maxHp}`], [moneyLabel(), el('span', { class: 'char-cash' }, currency() ? money(p.gold) : String(p.gold))],
          ['Story points', el('span', { class: 'sp-row' }, `${p.storyPoints} / ${State.LIMITS.storyPoints}`, spend)]]
          // The town's standing is in the Standing list when there is one; said once.
          .concat(facs.includes('town') ? [] : [['Reputation', capFirst(State.reputationTier())]])),
        facs.length ? [el('h3', null, 'Standing'), el('ul', { class: 'rep-list' }, facs.map(k => {
          const f = s.factions.find(x => x.id === k);
          let tier = '';
          try { tier = State.reputationTier(k); } catch (e) { tier = ''; }
          return el('li', { dataset: { faction: k } }, el('span', null, f ? f.name : capFirst(k)), el('span', { class: 'rep-tier' }, capFirst(tier || 'unknown')));
        }))] : null,
        el('h3', null, 'Goal'), el('p', null, p.goal || '—'),
        el('h3', null, 'Flaw'), el('p', null, p.flaw || '—'),
        progress.length ? [el('h3', null, 'Grown'), list(progress, g => {
          const t = s.threads.find(x => x.id === g.threadId);
          // The entry's own gain, as the quiet line said it ("+2 max HP" when the stat was capped; nothing for a loose end's thread). An entry from a build before gains were kept: the thread's reward.
          const what = Object.prototype.hasOwnProperty.call(g, 'gain') ? Pipeline.gainText(g.gain)
            : t && STATS.includes(t.reward) ? `+1 ${capFirst(t.reward)}` : t && t.reward ? `+1 ${t.reward}` : '+2 max HP';
          return `${t ? t.title : 'A thread resolved'}${what ? `: ${what}` : ''}`;
        }, '')] : null,
        el('h3', null, 'Conditions'),
        list(p.conditions, condition, 'None.'),
        el('h3', null, 'Inventory'),
        list(p.inventory, i => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}${i.notes ? ' — ' + i.notes : ''}`, 'Nothing.')
      ];
    },
    /* Person cards: who is here now, then everyone else the player has met
       (sorted by when last seen, attitude or name), then the people only
       heard of, then, folded away, Elsewhere and Gone. A search box at the
       top (it stays put while the list scrolls) narrows every group. Only
       what the player could know: name (or how they would describe a
       stranger), role, attitude, where they were last seen, their look, and
       notes (what they said, what they remember, loose ends, known
       threads). Never secrets, goals, factions or seeds. */
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
      const by = {
        seen: (a, b) => (b.t - a.t) || (a.i - b.i),
        attitude: (a, b) => (b.n.attitude - a.n.attitude) || (Rel.tracksOf(b.n).t - Rel.tracksOf(a.n).t) || (b.t - a.t) || (a.i - b.i),
        name: (a, b) => npcLabel(a.n).localeCompare(npcLabel(b.n)) || (a.i - b.i)
      };
      const rest = people.filter(n => !hereIds.includes(n.id))
        .map((n, i) => ({ n, i, t: seen[n.id] ? seen[n.id].turn : -1 }))
        .sort(by[peopleSort] || by.seen).map(x => x.n);
      const cards = list => el('div', { class: 'people-list' }, list.map(n => personCard(s, n, hereIds.includes(n.id))));
      const head = (title, list) => el('h3', null, title, el('span', { class: 'people-count' }, String(list.length)));
      const group = (key, title, list) => (list.length ? el('section', { class: 'people-group', dataset: { group: key }, 'aria-label': title }, head(title, list), cards(list)) : null);
      // Folded away unless the open card is in it.
      const folded = (key, title, list) => (list.length ? el('details', { class: 'people-group', dataset: { group: key }, open: list.some(n => n.id === openPerson) },
        el('summary', null, head(title, list)), cards(list)) : null);
      const search = el('input', { class: 'input', id: 'people-search', type: 'search', value: peopleQuery, placeholder: 'Search by name, job or place', autocomplete: 'off', 'aria-label': 'Search people',
        oninput: e => { peopleQuery = e.target.value; filterPeople(); } });
      const sort = el('div', { class: 'people-sort', role: 'group', 'aria-label': 'Sort the people you know' }, el('span', null, 'Sort:'),
        SORTS.map(([k, label]) => el('button', { type: 'button', class: 'chip', dataset: { sort: k }, 'aria-pressed': String(peopleSort === k), onclick: () => { peopleSort = k; renderPanel(); } }, label)));
      return [
        // While someone is being edited the search and sort step aside, so the form keeps the room (a phone with the keyboard up).
        editing ? null : el('div', { class: 'people-tools' }, search, sort),
        el('p', { class: 'empty people-none', hidden: true }, 'Nobody you know matches.'),
        group('here', 'Here now', now), group('known', 'Known', rest), group('heard', 'Heard of', heard), folded('elsewhere', 'Elsewhere', elsewhere), folded('gone', 'Gone', gone)];
    },
    /* What the player has to go on: the story so far (town news and the
       chronicle, newest first), leads (rumours, who told them, when), the
       threads they know (their people one tap away), what they owe or are
       owed (with how long is left), and their notes. */
    journal(s) {
      const day = s.time.day;
      const PH = p => Math.max(0, PHASES.indexOf(p));
      // News and the chronicle together, newest first: by day, then phase, then turn. A chronicle
      // entry with no day of its own takes the last day known before it (they run in order).
      const story = [];
      newsOf(s).forEach((n, i) => story.push({ day: n.day | 0, ph: PH(n.phase), turn: Number.isInteger(n.turn) ? n.turn : -1, i, when: dayLabel(n.day, n.phase), text: n.text, kind: 'news' }));
      let lastDay = 1;
      s.chronicle.forEach((c, i) => {
        const at = whenTurn(s, c.toTurn) || whenTurn(s, c.fromTurn);
        const known = Number.isInteger(c.toDay) ? c.toDay : Number.isInteger(c.day) ? c.day : at ? at.day : null;
        const d0 = known || lastDay;
        lastDay = d0;
        story.push({ day: d0, ph: at && at.phase ? PH(at.phase) : -1, turn: c.toTurn | 0, i, when: known ? `Up to Day ${known}` : `Turns ${c.fromTurn} to ${c.toTurn}`, text: c.summary, kind: 'chronicle' });
      });
      story.sort((a, b) => (b.day - a.day) || (b.ph - a.ph) || (b.turn - a.turn) || (b.i - a.i));
      const leads = s.rumours.filter(r => r.heard).map((r, i) => ({ r, i })).sort((a, b) => ((b.r.heardDay | 0) - (a.r.heardDay | 0)) || (b.i - a.i)).map(x => x.r);
      const threads = s.threads.filter(t => t.knownToPlayer);
      const ORDER = { open: 0, resolved: 1, failed: 2 };
      threads.sort((a, b) => (ORDER[a.status] | 0) - (ORDER[b.status] | 0));
      const obl = obligationsOf(s);
      // A missed obligation that can still be made good (State.obligations('owed')) stays with the open ones, not struck through.
      const owedIds = new Set(State.obligations('owed').map(o => o && o.id));
      const stillOwed = o => o.status === 'missed' && owedIds.has(o.id);
      const open = obl.filter(o => o.status === 'open' || !o.status || stillOwed(o)).sort((a, b) => (a.dueDay || 1e9) - (b.dueDay || 1e9));
      // Wave 29: lapsed ("can no longer be": a standoff, or the player came clean) is done too, shown as Dropped.
      const done = obl.filter(o => (o.status === 'met' || o.status === 'missed' || o.status === 'lapsed') && !stillOwed(o));
      /* Wave 29: what the player is owed for their silence (a demand on a
         record they hold: Rel.leverageOf), still to come, then paid (struck
         through, Settled). */
      const owedMe = (Array.isArray(s.leverage) ? s.leverage : []).filter(x => isObj(x) && x.holder === 'player' && isObj(x.demand) && Number.isInteger(x.demand.amount) && x.demand.amount > 0 && State.npc(x.over));
      const sec = (key, title, body) => el('section', { class: 'jr-sec', dataset: { section: key }, 'aria-label': title }, el('h3', null, title), body);
      const ul = (items, fmt, empty) => (items.length ? el('ul', { class: 'jr-list' }, items.map(fmt)) : el('p', { class: 'empty' }, empty));
      return [
        sec('story', 'Story so far', ul(story, x => el('li', { dataset: { kind: x.kind } }, el('span', { class: 'jr-day' }, x.when), el('span', { class: 'jr-text' }, x.text)), 'Nothing has happened yet.')),
        sec('leads', 'Leads', ul(leads, r => {
          const who = tellerOf(s, r);
          const when = Number.isInteger(r.heardDay) ? `Day ${r.heardDay}` : '';
          return el('li', { dataset: { rumour: r.id } }, el('span', { class: 'jr-text' }, r.text),
            who || when ? el('span', { class: 'jr-who' }, [who ? `${capFirst(who)} told you` : 'You heard it', when].filter(Boolean).join(', ')) : null);
        }, 'No rumours yet. People talk when they warm to you.')),
        sec('threads', 'Threads', ul(threads, t => {
          const met = (t.linkedIds || []).map(id => State.npc(id)).filter(n => n && hasCard(s, n));
          return el('li', { dataset: { thread: t.id, status: t.status } },
            el('span', null, el('strong', null, t.title), el('span', { class: 'thread-status', dataset: { status: t.status } }, t.status)),
            t.summary ? el('span', { class: 'muted' }, t.summary) : null,
            met.length ? el('span', { class: 'jr-people' }, met.map(n => el('button', { type: 'button', class: 'chip', dataset: { npc: n.id }, onclick: () => showPerson(n.id) }, n.knownToPlayer ? n.name : npcLabel(n)))) : null);
        }, 'Nothing yet.')),
        sec('owe', 'You owe / are owed', ul(open.concat(owedMe.filter(x => x.demand.paid !== true && x.status === 'used'), done, owedMe.filter(x => x.demand.paid === true)), o => {
          // Wave 29: "Hollis Byrd: $300 for keeping quiet", due Day 4 (tomorrow); once his payment comes, Settled.
          if (o.holder === 'player') {
            const n = State.npc(o.over);
            const paidUp = o.demand.paid === true;
            const left = Number.isInteger(o.demand.dueDay) ? o.demand.dueDay : null;
            return el('li', { class: paidUp ? 'jr-done' : null, dataset: { leverage: o.id, status: paidUp ? 'paid' : 'owed' } },
              el('span', { class: 'jr-text' }, `${n.knownToPlayer ? n.name : npcLabel(n)}: ${money(o.demand.amount)} for keeping quiet`),
              paidUp ? el('span', { class: 'jr-who' }, 'Settled') : left !== null ? el('span', { class: 'jr-due' + (left < day ? ' late' : '') }, `due Day ${left} (${dueIn(left, day)})`) : null);
          }
          const owedLate = stillOwed(o);
          const doneNow = !owedLate && (o.status === 'met' || o.status === 'missed' || o.status === 'lapsed');
          const late = owedLate || (!doneNow && Number.isInteger(o.dueDay) && o.dueDay < day);
          const paid = !doneNow && Number.isInteger(o.amount) && o.amount > 0 && (o.paid | 0) > 0 ? ` · ${money(o.paid)} of ${money(o.amount)} paid` : '';
          return el('li', { class: doneNow ? 'jr-done' : null, dataset: { obligation: o.id || '', status: o.status || 'open' } },
            el('span', { class: 'jr-text' }, obligationText(o)),
            doneNow ? el('span', { class: 'jr-who' }, o.status === 'met' ? (o.late ? 'Settled late' : 'Settled') : o.status === 'lapsed' ? 'Dropped' : 'Missed')
              : owedLate ? el('span', { class: 'jr-due late' }, `missed Day ${o.dueDay}, still owed${paid}`)
              : Number.isInteger(o.dueDay) ? el('span', { class: 'jr-due' + (late ? ' late' : '') }, `due Day ${o.dueDay} (${dueIn(o.dueDay, day)})${paid}`) : null);
        }, 'Nothing owed either way.')),
        sec('notes', 'Notes', ul(s.journal.slice().reverse(), j => {
          // The day and phase stored with the entry; the log only for entries written before it kept them.
          const at = Number.isInteger(j.day) ? { day: j.day, phase: j.phase || null } : whenTurn(s, j.turn);
          return el('li', null, el('span', { class: 'jr-day' }, at ? dayLabel(at.day, at.phase) : `Turn ${j.turn}`), el('span', { class: 'jr-text' }, j.text));
        }, 'No entries yet.'))
      ];
    },
    /* Objectives (wave 26): what the player knows they have to do, read
       from State on every draw (objSections); nothing to edit. */
    objectives(s) {
      const o = objSections(s);
      return [
        el('p', { class: 'obj-lede' }, 'What you know of. The story keeps the rest.'),
        o.nodes.length ? o.nodes : el('p', { class: 'empty' }, 'Nothing yet. When someone asks something of you, it shows here.')
      ];
    },
    places(s) {
      const here = State.loc(s.player.locationId);
      // Only places the player knows of: a home nobody has told them about is no exit yet (as on the map).
      const exits = here.exits.map(id => State.loc(id)).filter(l => l && l.discovered && l.away !== true);
      const known = s.locations.filter(l => l.discovered && l.away !== true);
      const away = s.locations.filter(l => l.away === true);
      const ban = bannedUntil(s, here);
      return [
        renderMap(s),
        el('div', { class: 'map-tools' }, el('button', { type: 'button', class: 'btn small map-expand', 'aria-haspopup': 'dialog', onclick: () => setMapExpanded(true) }, 'Expand map')),
        mapLegend(s),
        el('h2', null, here.name),
        el('p', { class: 'muted' }, placeStatusLine(here)),
        ban ? el('p', { class: 'plcard-warn' }, Number.isInteger(ban) ? `You are banned from here until Day ${ban}.` : 'You are banned from here.') : null,
        el('p', null, here.description),
        el('h3', null, 'Exits from here'),
        exits.length ? el('ul', { class: 'exit-list' }, exits.map(l => el('li', { dataset: { exit: l.id } },
          el('span', null, `${l.name}${heardOf(l) ? ' (heard of)' : ''}${closedTag(l)}`), goButton(s, l)))) : el('p', { class: 'empty' }, 'None.'),
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
      const seeds = s.seeds.map(sd => `[${World.seedStatus(sd)}] ${sd.id} @ ${sd.trigger.type} ${sd.trigger.value}${sd.notBeforeDay ? ' (not before day ' + sd.notBeforeDay + ')' : ''}${sd.origin ? ' · ' + sd.origin.kind + (sd.origin.npcId ? ' ' + sd.origin.npcId : '') : ''}\n  ${sd.effect}`).join('\n');
      const npcs = s.npcs.map(n => `${n.name} [${n.id}] ${n.alive === false ? 'dead' : n.status} att ${n.attitude} (${State.attitudeWord(n.attitude)})${n.knownToPlayer ? ' known' : ''} · now ${World.whereIs(n.id) || 'off-screen'}${n.home ? ' · home ' + n.home.locationId : ''} · ${pronounLabel(n.pronouns)}${isObj(n.created) ? ` · made by ${n.created.by}${n.created.relationToNpcId ? ` (${n.created.relation || 'related'} of ${n.created.relationToNpcId})` : ''}${n.unnamed ? ', no name yet' : ''}` : ''} · ${Rel.debugLine(n)}\n  goal: ${n.goal}\n  secret: ${n.secret || '-'}\n  memories: ${n.memories.map(m => `(${m.weight}, t${m.turn}) ${m.text}`).join(' | ') || '-'}${relDebug(s, n)}`).join('\n');
      // Wave 30: what is held between the player and the town, with the secret field side by side (never shown to the player), the secrets shown, and every gate.
      const levs = (Array.isArray(s.leverage) ? s.leverage : []).filter(isObj).map(x => { const who = State.npc(x.holder === 'player' ? x.over : x.holder); return `${x.id} [${x.status}] ${x.holder} over ${x.over} (w${x.weight}${x.aware ? ', aware' : ''}${x.playerKnows ? ', player knows' : ''}${isObj(x.demand) ? `, demand ${JSON.stringify(x.demand)}` : ''}): ${x.text}\n  secret: ${who && who.secret ? who.secret : '-'}`; }).join('\n');
      const secrets = Object.entries(isObj(s.known) && isObj(s.known.secrets) ? s.known.secrets : {}).map(([id, v]) => `${id}: ${JSON.stringify(v)}`).join('\n');
      // Wave 31: the town's ties (hidden ones marked, never shown to the player) and the news on its way ("npc_mavis hears hit from npc_dewayne by morning x0.29").
      const ties = Object.entries(isObj(s.ties) ? s.ties : {}).map(([k, t]) => Rel.debugTie(k, t, { s })).join('\n');
      const hearsay = (Array.isArray(s.hearsay) ? s.hearsay : []).filter(isObj).map(h => Rel.debugHearsay(h)).join('\n');
      const gates = Object.entries(Rel.GATES).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
      const rumours = s.rumours.map(r => `${r.heard ? '[heard] ' : '[unheard] '}${r.true ? 'TRUE ' : 'FALSE'} ${r.id}${r.sourceNpcId ? ' from ' + r.sourceNpcId : ''}${r.heardFrom ? ', told by ' + r.heardFrom : ''}${Number.isInteger(r.addedTurn) ? ` · news (turn ${r.addedTurn}${r.factionId ? ', ' + r.factionId : ''})` : ''}: ${r.text}`).join('\n');
      const threads = s.threads.map(t => `[${t.status}${t.knownToPlayer ? ', known' : ', hidden'}] ${t.id}: ${t.title}\n  ${t.summary}`).join('\n');
      const chron = s.chronicle.map(c => `turns ${c.fromTurn}-${c.toTurn}: ${c.summary}`).join('\n');
      const logSpan = s.log.length ? `log: ${s.log.length} entries, turns ${s.log[0].turn}-${s.log[s.log.length - 1].turn}` : 'log: empty';
      const events = World.recent.slice(-20).map(e => `turn ${e.turn} day ${e.day} ${e.phase}: ${e.text}`).join('\n');
      const rep = Object.keys(s.player.reputation).map(k => `${k} ${s.player.reputation[k]} (${State.reputationTier(k)})`).join(', ');
      const rejects = State.debugLog.filter(x => x.kind === 'rejected' || x.kind === 'style').slice(-15).map(x => x.kind === 'style' ? `turn ${x.turn} style (try ${x.attempt || 1}${x.kept ? ', kept' : ''}): ${x.problems.map(p => p.detail).join('; ')}` : `turn ${x.turn} ${x.source} ${x.path}: ${x.reason}`).join('\n');
      const apiErrors = State.debugLog.filter(x => x.kind === 'api' || x.kind === 'chronicle' || x.kind === 'upgrade').slice(-8).map(x => x.kind === 'chronicle' || x.kind === 'upgrade' ? `turn ${x.turn} ${x.kind === 'upgrade' ? 'update' : 'chronicle'}: ${x.reason}` : `turn ${x.turn} ${x.role}${x.status ? ' HTTP ' + x.status : ''}${x.requestId ? ' ' + x.requestId : ''}: ${x.reason}`).join('\n');
      const u = Api.usage;
      // Any other counters the transport keeps (1-hour cache writes and the like) follow the cost, by name.
      const KNOWN_U = ['calls', 'input', 'output', 'cacheRead', 'cacheCreation', 'cost', 'priced'];
      const LABEL_U = { cacheWrite1h: '1-hour cache write' };
      const extraU = b => { const x = Object.keys(b).filter(k => !KNOWN_U.includes(k) && typeof b[k] === 'number').map(k => `${LABEL_U[k] || k} ${b[k]}`); return x.length ? ` (${x.join(', ')})` : ''; };
      // Wave 41: a model with no price says so ("no price known for <model>: cost not counted") where the cost would be.
      const noPrice = b => (Api.priceNote ? Api.priceNote(b) : '') || 'a model with no price';
      const fmtU = b => `${b.calls} calls, in ${b.input}, out ${b.output}, cache read ${b.cacheRead}, cache write ${b.cacheCreation}${b.priced ? `, $${b.cost.toFixed(4)}` : `, ${noPrice(b)}`}${extraU(b)}`;
      const cacheRoles = Api.cacheLine ? Api.cacheLine() : '';
      const ttl = (() => { try { const b = Api.requestBody ? Api.requestBody('narrator', { system: 'x', cache: true }) : null; const cc = b && Array.isArray(b.system) && b.system[0] && b.system[0].cache_control; return cc ? JSON.stringify(cc) : 'unknown'; } catch (e) { return 'unknown'; } })();
      const news = newsOf(Object.assign({}, s, { news: Array.isArray(s.news) ? s.news : [] }));
      const allNews = (Array.isArray(s.news) ? s.news : []).map(n => `day ${n.day} ${n.phase || ''}${n.public === false ? ' (private)' : ''}${n.seen ? ' (seen)' : ''}${n.factionId ? ' · ' + n.factionId : ''}${n.epilogue ? ' · epilogue' : ''}: ${n.text}`).join('\n');
      const obls = obligationsOf(s).map(o => `[${o.status || 'open'}] ${o.id || '?'} ${o.kind || ''} ${o.npcId || ''}${Number.isInteger(o.amount) ? ' $' + o.amount : ''}${Number.isInteger(o.dueDay) ? ' due day ' + o.dueDay : ''}${o.itemName ? ' item ' + o.itemName : ''}: ${o.text || ''}`).join('\n');
      const bans = (Array.isArray(s.bans) ? s.bans : []).map(b => `${b.locationId} until day ${b.untilDay}${b.byNpcId ? ' (by ' + b.byNpcId + ')' : ''}`).join('\n');
      const fired = Array.isArray(s.eventsFired) ? s.eventsFired.join(', ') : '';
      return el('div', { class: 'dbg' },
        el('p', { class: 'hint build-line', id: 'dbg-build' }, State.buildLine()), // Wave 46: which build, for a bug report
        el('h3', null, 'News'), pre(allNews || `none (${news.length} shown to the player)`),
        el('h3', null, 'Obligations'), pre(obls || 'none'),
        el('h3', null, 'Bans'), pre(bans || 'none'),
        el('h3', null, 'Events fired'), pre(fired || 'none'),
        el('h3', null, 'Meta'), pre(`turn ${s.meta.turn} · day ${s.time.day} ${s.time.phase} · seed ${s.meta.seed} · rng calls ${s.meta.rngCalls} · shorts ${s.time.shorts}${s.time.late ? ' (late night)' : ''}${s.time.noSleep ? ' · no sleep last night' : ''} · rules v${State.rulesVersion(s)}${Upgrade.behind(s) ? ` (current v${State.RULES_VERSION})` : ''}\nflags ${JSON.stringify(s.flags)}\nreputation ${rep}\nretry lock ${s.meta.lastRollKey || '-'}\nundo depth ${State.undoDepth()}`),
        el('h3', null, 'Faction clocks'), pre((clocks || '-') + forced),
        el('h3', null, 'Due events'), pre([due, visits].filter(Boolean).join('\n') || 'none'),
        el('h3', null, 'Seeds'), pre(seeds || '-'),
        el('h3', null, 'World events'), pre(events || 'none yet'),
        el('h3', null, 'NPCs (hidden)'), pre(npcs || '-'),
        el('h3', null, 'Leverage'), pre(levs || 'none'),
        el('h3', null, 'Secrets shown'), pre(secrets || 'none'),
        el('h3', null, 'Ties'), pre(ties || 'none'),
        el('h3', null, 'Hearsay'), pre(hearsay || 'nothing on its way'),
        el('h3', null, 'Gates'), pre(gates),
        el('h3', null, 'Rumours'), pre(rumours || '-'),
        el('h3', null, 'Threads'), pre(threads || '-'),
        el('h3', null, 'Chronicle'), pre(`${chron || 'none yet'}\n${logSpan}`),
        el('h3', null, 'Rejected changes'), pre(rejects || 'none'),
        el('h3', null, `API (${Api.providerName()})`), pre(`turn: ${fmtU(u.turn)}\nsession: ${fmtU(u.session)}\nsession cost: ${u.session.priced ? '$' + u.session.cost.toFixed(4) : `$${u.session.cost.toFixed(4)} (${noPrice(u.session)})`} over ${sessionTurns} turns\nnarrator cache: ${ttl}\ncache by role: ${cacheRoles || 'nothing read or written yet'}`),
        el('h3', null, 'API errors'), pre(apiErrors || 'none'),
        // Wave 28: the bookkeeper turns kept this session (Settings -> Advanced -> Keep bookkeeper packets), as JSONL for the labelled eval.
        el('h3', null, 'Bookkeeper turns'),
        el('p', { class: 'hint' }, keepOn() ? `${Pipeline.bookTurns.length} kept this session (the last ${Pipeline.BOOK_TURNS_MAX}).` : 'Turn on "Keep bookkeeper packets" in Settings, under Advanced, to keep them.'),
        el('button', { type: 'button', class: 'btn small', id: 'dbg-export-book', disabled: !keepOn() || !Pipeline.bookTurns.length, onclick: () => exportBookTurns() }, 'Export bookkeeper turns'),
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
     real narrator (the tag is not part of the narration text). A draft
     being rewritten keeps its "Rewriting…" label. */
  function fillParas(node, text) {
    const paras = String(text || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
    const head = node.dataset.turnLabel ? [turnHeading(node.dataset.turnLabel)] : [];
    const tag = node.dataset.mock === '1' ? [el('p', { class: 'f-tag' }, 'Mock narration')] : [];
    const label = node.classList.contains('rewriting') ? [rewritingLabel()] : [];
    node.replaceChildren(...head, ...tag, ...label, ...paras.map(t => el('p', null, t)));
  }
  function rewritingLabel() { return el('p', { class: 'f-rewriting' }, 'Rewriting…'); }
  /* Wave 45: each narration opens with a heading only screen readers meet
     ("Turn 3"; the arrival's "Arrival"), so the story can be read turn by
     turn with the headings list. Its words are drawn by CSS from
     data-label (as the recap's heading is), so the narration's text and
     innerText stay its own paragraphs. turn: the log entry's (meta.turn
     while it is written); a node without one has no heading. */
  function turnLabel(turn) { return Number.isInteger(turn) && turn >= 0 ? (turn ? `Turn ${turn}` : 'Arrival') : ''; }
  function liveTurn() { const s = State.current; return s && s.meta ? s.meta.turn : null; }
  function turnHeading(label) { return el('h2', { class: 'f-turn-h visually-hidden', dataset: { label } }); }
  function narrationNode(text, mock, turn) {
    const label = turnLabel(turn);
    const data = Object.assign({}, mock ? { mock: '1' } : {}, label ? { turnLabel: label } : {});
    const n = el('div', { class: 'f-item f-narr', dataset: Object.keys(data).length ? data : null });
    fillParas(n, text);
    return n;
  }
  /* "Day 2 · Friday · Evening" (the weekday once the engine has a calendar). */
  function dividerNode(day, phase) { return el('div', { class: 'f-item f-divider', role: 'separator', dataset: { day: String(day), phase } }, dayLabel(day, phase)); }
  /* The time the feed shows now: its last divider's (a quiet line printed under it belongs to that time), else the clock's. */
  function shownTime() {
    for (let n = d.feed.lastElementChild; n; n = n.previousElementSibling) {
      if (n.classList.contains('f-divider') && n.dataset.phase) return { day: toInt(n.dataset.day), phase: n.dataset.phase };
    }
    const t = State.current ? State.current.time : null;
    return t ? { day: t.day, phase: t.phase } : null;
  }
  function rollNode(r) { return el('p', { class: 'f-item f-roll' }, r.line); }
  /* A quiet line; the town's news gets a little more weight than a dice
     line: overnight, and (wave 6 integration) each day a /cheat time jump
     passed ("Meanwhile in town, Day 4: …"). */
  function quietNode(text) {
    const m = /^(Overnight in town|Meanwhile in town(?:, Day \d+)?):\s*/.exec(String(text));
    if (m) return el('p', { class: 'f-item f-quiet f-news' }, el('span', { class: 'f-news-k' }, `${m[1]}: `), String(text).slice(m[0].length));
    return el('p', { class: 'f-item f-quiet' }, text);
  }
  /* The recap (Continue, /recap, ⋯ Recap, after a night's sleep): a heading
     and one line per kind, the kind in bold. Its "In town" line is left out
     when the overnight news was just told above it. */
  const RECAP_HEAD = 'Where things stand';
  function newsJustAbove() {
    for (let n = d.feed.lastElementChild; n; n = n.previousElementSibling) {
      if (n.classList.contains('f-news')) return true;
      if (n.classList.contains('f-input') || n.classList.contains('f-notice')) return false;
    }
    return false;
  }
  function recapNode(text) {
    let lines = String(text || '').split('\n').map(t => t.trim()).filter(Boolean);
    if (newsJustAbove()) lines = lines.filter(t => !/^In town:/.test(t));
    // The heading is drawn by CSS (::before), so the node's text stays the recap's own lines.
    return el('div', { class: 'f-item f-notice recap', role: 'group', 'aria-label': RECAP_HEAD },
      lines.map((t, i) => {
        const m = /^([A-Z][A-Za-z ]{0,24}):\s/.exec(t);
        return [i ? '\n' : '', m ? [el('span', { class: 'f-recap-k' }, `${m[1]}:`), t.slice(m[1].length + 1)] : t];
      }));
  }
  /* /help (and Commands help in the ⋯ list): its first line ("Commands")
     is a heading, styled as the recap's; the rest is one command a line. */
  function helpNode(text) {
    const lines = String(text || '').split('\n');
    const head = lines.length > 1 ? lines.shift().trim().replace(/:$/, '') : '';
    return el('div', { class: 'f-item f-notice help' },
      head ? el('span', { class: 'f-help-h' }, head) : null,
      el('span', { class: 'f-notice-text' }, lines.join('\n')));
  }
  /* A failed turn's notice ("… Your action was kept in the box."): Try
     again; and Open Settings when the key or a model is the trouble. */
  const KEPT_LINE = 'Your action was kept in the box.';
  function noticeActs(text) {
    const acts = [];
    if (text.includes(KEPT_LINE)) acts.push(el('button', { type: 'button', class: 'btn small', dataset: { retry: '1' }, onclick: e => retryTurn(e) }, 'Try again'));
    if (/\bin Settings\b/.test(text)) acts.push(el('button', { type: 'button', class: 'btn small', dataset: { settings: '1' }, onclick: () => openSettingsFor(text) }, 'Open Settings'));
    return acts.length ? el('span', { class: 'f-notice-acts' }, acts) : null;
  }
  /* Try again: the failed line (put back in the box, or, if new words are
     typed there, sent as it was without touching them), or the failed Wait. */
  async function retryTurn(e) {
    if (!canAct({ say: true })) return null;
    const row = e && e.target && e.target.closest ? e.target.closest('.f-notice-acts') : null;
    (isMobile() ? d.send : d.cmd).focus({ preventScroll: true });
    if (row) row.remove();
    const box = d.cmd.value;
    const last = lastSent;
    if (last && last.text && box.trim() && box !== last.text) {
      let res = null;
      try { res = await Pipeline.submit(last.text, { mode: last.mode, to: last.to }); } catch (x) { console.error(x); res = { restoreInput: true }; }
      if (res && res.restoreInput) restoreAction(last.text);
      syncSendLabel();
      return res;
    }
    if (box.trim()) return send(false);
    if (last && last.pass) return send(true);
    if (last && last.text) { d.cmd.value = last.text; autosize(); return send(false); }
    return null;
  }
  /* Settings, at the field the notice is about (the key, else the models under Advanced). */
  function openSettingsFor(text) {
    showScreen('settings');
    if (/\bmodel/i.test(text) && !/\bkey\b/i.test(text)) { d.setAdvanced.open = true; d.setNarratorModel.focus({ preventScroll: false }); }
    else d.setKey.focus({ preventScroll: false });
  }
  /* A Do line is the text as typed; a Say line (a turn's speech or a log
     entry with mode 'say') is the words in quotes and who they were said to. */
  function inputNode(text, sp) {
    if (!isSay(sp)) return el('p', { class: 'f-item f-input' }, text);
    const npc = sp.to && sp.to !== 'everyone' && State.current ? State.current.npcs.find(n => n.id === sp.to) : null;
    const who = sp.toLabel || (npc ? npcLabel(npc) : (sp.to === 'everyone' || !sp.toName ? 'everyone' : sp.toName));
    return el('p', { class: 'f-item f-input f-say', dataset: { to: sp.to || 'everyone' } },
      el('span', { class: 'f-words' }, `“${text}”`), el('span', { class: 'f-to' }, ` — to ${who}`));
  }
  // ----- the card table (wave 10) -----
  /* Five-card draw at the dealer's table (Pipeline.gamble): one block in
     the feed, under the player's line and before the narration. Its head
     names the table, the stake and the pot; then the dealer's five (face
     down until the showdown, face up when the player carries a marked
     deck) under the player's read of him, and the player's five: buttons
     while the hand is open (each named with whether it is held, a Hold
     tag; a click, Space or Enter), with Draw and Fold. After the draw both
     hands are face up with their names, and the result line gives the cash
     after. Built from nodes. A finished table is the log entry's cards
     (State logCards), which rebuildFeed draws again where it was.
     Wave 11 (the QA of the table): the head is the group's name
     (aria-labelledby) and takes the focus when the table opens, never a
     card; Draw says how many it replaces ("Draw 3", "Stand pat") and Fold
     what it costs ("Fold −$10"); the hint says Stop folds; the read is not
     shown over a marked deck's face-up cards; after the showdown the cards
     drawn are marked "New", the dealer's draw is said ("Curtis draws 3")
     and the read says whether it was right. */
  /* Wave 13 (the owner: "Keep both and build holdem too", "more than the 2
     of us", "a cheat win somewhere so i can skip the whole game and win"):
     the table plays five-card draw or Texas hold'em, with up to three
     other seats; with no game named or remembered it opens as a chooser
     (Five-card draw, Texas hold'em). One row per seat (the dealer marked
     "(deals)"): their cards (two at hold'em, five at draw; face down until
     the showdown, face up with a marked deck) and a status cell ("checks",
     "bets $4", "calls $4", "folds", then the hand's name, the winner's
     "takes the pot"). Hold'em has the board (five slots, turned three, one
     and one, under the street's name) and Check / Bet $u or Call $u / Fold.
     Every open table has a pot line and, at the end of its hint, a small
     Win (cheat) control that ends the hand the player's. */
  /* Wave 18 (the owner: "Make the poker game interactive, as in I decide how
     much money to add, go all in, etc."): no-limit betting. The stake is
     the buy-in; every seat antes; on the player's turn the table has Check
     and Bet, or Call, Raise and Fold, and under them the amount (betActs);
     the pot line says what the player has in and has left; the seats' cells
     say "bets $8", "raises to $24", "calls $24", "all in $20"; a bet can be
     typed in the box (Pipeline.typedBet). Draw has a round of betting
     after the draw (Pipeline.handKind 'drawbet'). */
  function betting(kind) { return kind === 'holdem' || kind === 'drawbet'; }
  /* t, kind: the table as it is being drawn again (wave 19: tableRedrawn reads the nudge again from it); else the open hand's. */
  function handNudge(t0, kind0) {
    const t = t0 || Pipeline.openHand;
    const kind = kind0 || Pipeline.handKind;
    if (kind === 'choose') return "The card table is open: pick Five-card draw or Texas hold'em. Stop leaves the table (nothing lost).";
    // Wave 14 (QA #10): the nudge names the Win (cheat) control too (typing /cheat win presses it). Wave 18: and what can be typed.
    const stop = `Stop folds the hand${t ? ` (−${money(t.playerIn)})` : ''}; Win (cheat) ends it yours.`;
    if (betting(kind)) {
      const opts = t && Array.isArray(t.options) ? t.options : [];
      const a = (t && t.ask) || {};
      const raise = opts.includes('raise');
      // At a limit table "all in" is only offered when the stack is short of the bet (amendment 2).
      const allIn = !a.limit || a.minTo >= a.maxTo ? ', "all in"' : '';
      if (opts[0] === 'call') return `Your hand is on the table: Call ${money(a.toCall)}${raise ? ', Raise' : ''} or Fold (or type "call"${raise ? `, "raise to ${a.minTo}"${allIn}` : ''} or "fold"). ${stop}`;
      if (opts.includes('bet')) return `Your hand is on the table: Check or Bet (or type "check"${allIn ? `, "bet ${a.minTo}" or "all in"` : ` or "bet ${a.minTo}"`}). ${stop}`;
      return `Your hand is on the table: Check (or type "check"). ${stop}`;
    }
    return `Your hand is on the table: pick the cards to hold, then Draw or Fold. ${stop}`;
  }
  /* A command typed with a hand open (wave 14, QA #10): /cheat win is the
     Win (cheat) control; /cheat cards says the cards are dealt. Wave 15:
     /help (or /commands) is shown as ever, the hand left open. Wave 16:
     /undo (and /undo N, /undo all, /rewind N) takes back the turn that
     dealt the hand, free (Pipeline.takeBackHand): the box is emptied first,
     so the turn's own line goes back in it. Returns true when the line was
     taken. */
  const CHEAT_WIN_TYPED = /^\/cheat\s+win\s*$/i;
  const CHEAT_CARDS_TYPED = /^\/cheat\s+cards\s*$/i;
  const HELP_TYPED = /^\/(?:help|commands)[:.,!?]*$/i;
  const UNDO_TYPED = /^\/(?:undo|rewind)[:.,!?]*(?:\s|$)/i;
  function handCommand(text) {
    if (!Pipeline.handOpen) return false;
    const t = String(text || '').trim();
    if (HELP_TYPED.test(t)) {
      d.cmd.value = '';
      autosize();
      syncSendLabel();
      hideAc();
      Commands.run(t);
      return true;
    }
    if (UNDO_TYPED.test(t)) {
      d.cmd.value = '';
      autosize();
      syncSendLabel();
      hideAc();
      Promise.resolve(Commands.run(t)).then(r => { if (r && r.restoreInput && r.reason === 'usage') restoreAction(t); syncSendLabel(); }, e => console.error(e));
      return true;
    }
    if (CHEAT_WIN_TYPED.test(t)) {
      const node = $('#feed .f-cards.open');
      d.cmd.value = '';
      autosize();
      syncSendLabel();
      Pipeline.playHand({ win: true });
      if (node && !isMobile() && screen === 'game') d.cmd.focus({ preventScroll: true });
      return true;
    }
    if (CHEAT_CARDS_TYPED.test(t)) {
      nudge(Pipeline.handKind === 'choose' ? 'No cards yet: use Win (cheat) or type /cheat win.' : 'The cards are dealt: use Win (cheat) or type /cheat win.');
      return true;
    }
    // A bet typed with the hand open (wave 18): "bet 10", "raise to 30", "all in", "call", "check", "fold" act as the buttons do.
    const kind = Pipeline.handKind;
    if (betting(kind) || kind === 'draw') {
      const b = Pipeline.typedBet(t, Pipeline.openHand);
      // Past the limit (amendment 2): the dealer's line under the table, the status line says why, the words stay in the box.
      if (b && b.refuse) { UI.feed.cardsSay($('#feed .f-cards.open'), b.refuse); nudge(b.say); return true; }
      if (b && b.say) { nudge(b.say); return true; }
      // "draw 3" (wave 19, QA D9): Draw, when it replaces that many; else how to get there.
      if (b && b.draw) {
        const node = $('#feed .f-cards.open');
        const btn = node ? $('.cards-draw', node) : null;
        const free = node ? $$('.cards-you button.card', node).filter(x => x.dataset.held !== 'true').length : -1;
        if (!btn || free !== b.draw) { nudge('Tap the cards you keep, then Draw (it says how many).'); return true; }
        d.cmd.value = '';
        autosize();
        syncSendLabel();
        hideAc();
        endHand(btn, false);
        if (!isMobile() && screen === 'game') d.cmd.focus({ preventScroll: true });
        return true;
      }
      // Asking for table stakes is between hands (amendment 2): the words stay in the box for when this one is over.
      if (!b && Pipeline.stakesWords(t)) { const o = Pipeline.openHand; nudge(`Ask ${String((o && o.dealerName) || 'the dealer').split(/\s+/)[0]} for table stakes between hands: finish this one first.`); return true; }
      if (b && b.choice) {
        const node = $('#feed .f-cards.open');
        d.cmd.value = '';
        autosize();
        syncSendLabel();
        hideAc();
        // A clamp's note (wave 19, QA D4) shows once the table is drawn again for the move, not before it (tableRedrawn).
        tableNote = b.note || null;
        // What it went in as goes with the move (wave 20, QA N4): said under the result if this move finishes the hand.
        Pipeline.playHand(b.after ? Object.assign({}, b.choice, { why: b.after }) : b.choice);
        if (node && !isMobile() && screen === 'game') d.cmd.focus({ preventScroll: true });
        return true;
      }
    }
    return false;
  }
  // The stake, and why it is that (wave 11, M5): "stake $140, all you have", "stake $20, the usual"; and what was named that is no stake (wave 12, L8): "stake $20, the usual: $0.50 is no stake".
  function stakeText(t) {
    const named = Number.isFinite(t.named) ? `: ${Pipeline.moneyNamed(t.named)} is no stake` : '';
    return `stake ${money(t.stake)}${t.stakeNote === 'all' ? ', all you have' : t.stakeNote === 'usual' ? `, the usual${named}` : t.stakeNote === 'half' ? ', half of what you have' : ''}`;
  }
  // The game in the head once it is known (wave 13): "Curtis Pruett's table · Texas hold'em · stake $20 · pot $8"; the chooser's is the dealer and the stake.
  /* The house rules in the head (wave 18): "$20 to sit · $1 ante · $4 bets", with why the stake is that ("$140 to sit, all you have"). */
  function rulesHead(t) {
    const named = Number.isFinite(t.named) ? `: ${Pipeline.moneyNamed(t.named)} is no stake` : '';
    const why = t.stakeNote === 'all' ? ', all you have' : t.stakeNote === 'usual' ? `, the usual${named}` : t.stakeNote === 'half' ? ', half of what you have' : '';
    // Amendment 2: the structure, "$4 limit" (the house game) or "no limit" (table stakes, once the dealer agreed).
    return `${money(t.stake)} to sit${why} · ${money(t.ante)} ante · ${t.structure === 'nolimit' ? 'no limit' : `${money(t.unit)} limit`}`;
  }
  /* The pot (wave 14, QA #8): the table's own (the open table's as it stands, the record's as played); a wave 10-12 record (heads up at draw) has none, so it is worked out: the stake each, a fold's price for the player. */
  function potOf(t) {
    if (Number.isInteger(t.pot)) return t.pot;
    const others = (Array.isArray(t.seats) ? t.seats.length : 0) + 1;
    return t.stake * others + (t.result === 'fold' || t.folded === true ? Pipeline.foldPrice(t.stake) : t.stake);
  }
  function cardsHead(t) {
    // Wave 18: the house rules where the table has them (a hand recorded before wave 18 keeps its stake).
    const terms = Number.isInteger(t.ante) && Number.isInteger(t.unit) ? rulesHead(t) : stakeText(t);
    if (t.choose) return `${t.dealerName}'s table · ${terms}`;
    const game = Pipeline.GAME_NAMES[t.game === 'holdem' ? 'holdem' : 'draw'];
    return `${t.dealerName}'s table · ${game} · ${terms} · pot ${money(potOf(t))}`;
  }
  /* The house rules in words, once a hand (wave 18): on the chooser, else on the dealt table's first hint ("Twenty to sit, a dollar ante, four-dollar bets."). */
  function rulesSaid(t) { return t.choose || t.first ? `${Pipeline.rulesWords(t.stake, t.structure)} ` : ''; }
  function cardBits(c) { return [el('span', { class: 'card-rank', 'aria-hidden': 'true' }, Cards.label(c)), el('span', { class: 'card-suit', 'aria-hidden': 'true' }, Cards.sign(c))]; }
  // A card face up; one drawn (after the showdown, wave 11, S2) has a "New" tag and says so in its name.
  function cardFace(c, drawn) {
    return el('span', { class: 'card' + (Cards.red(c) ? ' red' : '') + (drawn ? ' drawn' : ''), role: 'img', 'aria-label': Cards.cardName(c) + (drawn ? ', drawn' : ''), dataset: { card: c } },
      cardBits(c), drawn ? el('span', { class: 'card-tag card-new', 'aria-hidden': 'true' }, 'New') : null);
  }
  function cardBack() { return el('span', { class: 'card back', role: 'img', 'aria-label': 'Face-down card' }); }
  /* One of the player's cards while the hand is open: a button whose name
     says whether it is held (wave 11, L11: "Eight of hearts, held" or "…,
     not held"); data-held is the state the look follows. */
  function holdName(c, held) { return `${Cards.cardName(c)}, ${held ? 'held' : 'not held'}`; }
  function cardToggle(c, i) {
    return el('button', { type: 'button', class: 'card' + (Cards.red(c) ? ' red' : ''), 'aria-label': holdName(c, false), dataset: { i: String(i), card: c, held: 'false' }, onclick: e => toggleHold(e.currentTarget) },
      cardBits(c), el('span', { class: 'card-tag card-hold', 'aria-hidden': 'true' }, 'Hold'));
  }
  function toggleHold(b) {
    if (!b || !Pipeline.handOpen) return;
    const held = b.dataset.held !== 'true';
    b.dataset.held = String(held);
    b.setAttribute('aria-label', holdName(b.dataset.card, held));
    const node = b.closest('.f-cards');
    if (node) syncDraw(node);
  }
  // Draw says how many cards it replaces (wave 11, S1): "Draw 3", or "Stand pat" with all five held.
  function drawLabel(n) { return n ? `Draw ${n}` : 'Stand pat'; }
  function syncDraw(node) {
    const btn = $('.cards-draw', node);
    if (btn) btn.textContent = drawLabel($$('.cards-you button.card', node).filter(b => b.dataset.held !== 'true').length);
  }
  const CARDS_RESULT = {
    win: t => `You win ${money(Math.abs(t.delta))}`, lose: t => `You lose ${money(Math.abs(t.delta))}`,
    // A split with more at the table can still move money (wave 13): "Split pot: you win $6".
    split: t => (t.delta ? `Split pot: ${t.delta > 0 ? 'you win' : 'you lose'} ${money(Math.abs(t.delta))}` : 'Split pot'),
    // Why a fold the player did not press (wave 12, L4): Stop, or the page closed with the hand open.
    fold: t => `${t.closed ? 'You left the table, so you fold' : t.stopped ? 'Stopped, so you fold' : 'You fold'}: −${money(Math.abs(t.delta))}`, caught: t => `Caught cheating: you lose ${money(t.stake)}`
  };
  const STREET_LABELS = ['Pre-flop', 'The flop', 'The turn', 'The river', 'Showdown'];
  const FOLD_WHEN = ['before the flop', 'on the flop', 'on the turn', 'on the river'];
  const DRAW_WHEN = ['before the draw', 'after the draw'];
  // Wave 14 (QA #11): the game changes only between hands, so the hint is on the chooser and under a finished table, never on an open hand.
  const SWITCH_HINT = "Name the game in your words to skip this choice (hold'em or draw).";
  const NEXT_HINT = "Next hand: name the game in your words to switch (hold'em or draw).";
  const firstOf = name => String(name || '').split(/\s+/)[0];
  // The Win (cheat) control, at the end of the hint on every open table (wave 13).
  function winButton() { return el('button', { type: 'button', class: 'btn small cards-win', onclick: e => tableAct(e.currentTarget, { win: true }) }, 'Win (cheat)'); }
  function tableAct(btn, choice) {
    const node = btn && btn.closest('.f-cards');
    if (!node || !node.classList.contains('open') || !Pipeline.handOpen) return;
    Pipeline.playHand(choice);
  }
  /* One seat's row: its name (the dealer marked), what it last did or how
     it ended, the player's read of it, and its cards. */
  function seatRow(o) {
    return el('div', { class: `cards-side ${o.cls}`, dataset: Object.assign({ seat: o.key }, o.won ? { won: 'true' } : {}) },
      el('p', { class: 'cards-top' }, el('span', { class: 'cards-who' }, o.who), o.deals ? el('span', { class: 'cards-deals' }, '(deals)') : null, el('span', { class: 'cards-status' }, o.status || '')),
      o.read || null, o.note || null,
      el('div', { class: 'cards-row', role: 'group', 'aria-label': o.label }, o.cards),
      o.name || null);
  }
  function readLine(r, verdict) {
    return el('p', { class: 'cards-read' }, el('span', { class: 'cards-k' }, 'Your read: '), `${r.text}.`,
      verdict ? el('span', { class: 'cards-verdict', dataset: { right: String(r.right === true) } }, r.right === true ? ' You were right.' : ' You were wrong.') : null);
  }
  function fillChooser(node, t, head) {
    node.classList.add('open');
    node.replaceChildren(head,
      el('p', { class: 'cards-ask' }, 'Which game?'),
      el('div', { class: 'cards-acts cards-pick' },
        el('button', { type: 'button', class: 'btn small cards-game', dataset: { game: 'draw' }, onclick: e => tableAct(e.currentTarget, { game: 'draw' }) }, 'Five-card draw'),
        el('button', { type: 'button', class: 'btn small cards-game', dataset: { game: 'holdem' }, onclick: e => tableAct(e.currentTarget, { game: 'holdem' }) }, "Texas hold'em")),
      el('p', { class: 'cards-hint' }, `${rulesSaid(t)}Stop leaves the table (nothing lost). ${SWITCH_HINT} `, winButton()));
  }
  /* The pot line on an open table (wave 18): the pot, what the player has in and what they have left of the buy-in: "Pot $56 · you're in for $20 · $0 left". */
  function potLine(t) {
    const inn = Number.isInteger(t.playerIn) ? t.playerIn : t.stake;
    return el('p', { class: 'cards-pot' }, `Pot ${money(Number.isInteger(t.pot) ? t.pot : t.stake * 2)} · you're in for ${money(inn)} · ${money(Math.max(0, (t.stake | 0) - inn))} left`);
  }
  /* The round's buttons and the amount (wave 18). Check (primary) and Bet,
     or Call $X (primary), Raise and Fold; Call and Fold when no raise is
     left (four raises a round, or nobody left to answer one). Under them,
     when there is a choice of amount: a field with the amount bet or
     raised to on the round, − and + by the ante, and Min, ½ pot, Pot and
     All in. Bet or Raise reads what it will do with the amount ("Bet $8",
     "Raise to $24", "All in $20": all in names everything the player will
     have in); an amount the table does not allow is clamped (under the
     least: the least; over the stack: all in) and the line under the field
     says so. Enter in the field presses Bet or Raise. */
  function betActs(t) {
    const opts = Array.isArray(t.options) && t.options.length ? t.options : ['check'];
    const a = isObj(t.ask) ? t.ask : null;
    const kind = opts.includes('raise') ? 'raise' : opts.includes('bet') ? 'bet' : null;
    // All in names what goes in on the round, as bets do ("All in $19" at $20, after the $1 ante: what is left).
    const label = to => (a && to >= a.maxTo ? `All in ${money(to)}` : kind === 'bet' ? `Bet ${money(to)}` : `Raise to ${money(to)}`);
    const call = a && a.toCall ? `Call ${money(a.toCall)}${a.toCall >= a.left ? ' (all in)' : ''}` : 'Call';
    let main = null;
    let field = null;
    let sync = () => (a ? a.minTo : 0);
    const press = btn => { const to = sync(true); tableAct(btn, { act: kind, to }); };
    const btns = opts.map((o, i) => {
      const b = el('button', { type: 'button', class: `btn ${i === 0 ? 'primary ' : ''}small cards-${o}`, dataset: { act: o },
        onclick: e => (o === 'fold' ? tableAct(e.currentTarget, { fold: true }) : o === kind && a ? press(e.currentTarget) : tableAct(e.currentTarget, { act: o })) },
      o === 'check' ? 'Check' : o === 'fold' ? 'Fold' : o === 'call' ? call : kind === 'bet' ? 'Bet' : 'Raise');
      if (o === kind) main = b;
      return b;
    });
    const acts = actsNamed(el('div', { class: 'cards-acts' }, btns), t, t.playerIn);
    if (!kind || !a || !main) return [acts];
    // One amount only: all in when the stack is short, or a limit table's bet or raise (amendment 2: no field, no presets).
    if (a.limit || a.minTo >= a.maxTo) { main.textContent = label(a.minTo); main.dataset.to = String(a.minTo); sync = () => a.minTo; return [acts]; }
    const note = el('p', { class: 'cards-amt-note', 'aria-live': 'polite' });
    /* The field read (wave 20, QA N10): a minus sign makes no amount of its
       own, so it is the least ("Bets are at least $4."); cents are cut to
       whole dollars ("Whole dollars at this table: $60."); each said on the
       line under the field, before any change the table makes. */
    const parse = () => {
      const m = /(-)?\s*\$?\s*(-)?\s*(\d[\d,]*)(?:\.(\d*))?/.exec(field.value.replace(/[−–]/g, '-'));
      if (!m) return { n: NaN, why: '' };
      if (m[1] || m[2]) return { n: a.minTo, why: kind === 'raise' ? `Raises are to at least ${money(a.minTo)}.` : `Bets are at least ${money(a.minTo)}.` };
      const n = parseInt(m[3].replace(/,/g, ''), 10);
      return { n, why: m[4] && /[1-9]/.test(m[4]) ? `Whole dollars at this table: ${money(n)}.` : '' };
    };
    const read = () => parse().n;
    /* Wave 19 (QA D7): the button always reads what the amount comes to,
       and the line under the field says each change ("Bets go in
       twenties: $50 rounds up to $60.", "That would leave you less than a
       bet, so it is all in $110."; Pipeline.clampWhy). The field shows
       that amount once typing stops (change), at once after −, +, a
       preset; Enter commits only an amount the field and the button both
       show: a typed amount the table changes is put in the field first,
       with its reason, and the next Enter bets it. */
    sync = settle => {
      const p = parse();
      const want = p.n;
      const c = Pipeline.clampWhy(want, a.minTo, a.maxTo, a.unit, kind);
      const to = c.to;
      main.textContent = label(to);
      main.dataset.to = String(to);
      const least = kind === 'bet' ? `The least bet is ${money(a.minTo)}` : `The least raise is to ${money(a.minTo)}`;
      note.textContent = !Number.isFinite(want) ? (field.value.trim() ? `Type an amount in dollars. ${least}.` : '') : [p.why, c.why].filter(Boolean).join(' ');
      if (settle && String(to) !== field.value) field.value = String(to);
      return to;
    };
    // A value put in the field by −, + or a preset, with why it is that (raw: what it would have been).
    const set = (v, why) => { field.value = String(v); sync(); if (why) note.textContent = why; };
    // + is the next amount up (said when that is all in); − the next one down that leaves at least a bet behind (from all in $19 at $4 bets: $12).
    const step = k => {
      const cur = Pipeline.clampTo(read(), a.minTo, a.maxTo, a.unit);
      if (k > 0) { const c = Pipeline.clampWhy(cur + a.unit, a.minTo, a.maxTo, a.unit, kind); set(c.to, cur >= a.maxTo ? '' : c.why); return; }
      let down = Math.floor((cur - 1) / a.unit) * a.unit;
      while (down > a.minTo && a.maxTo - down < a.unit) down -= a.unit;
      set(Math.max(a.minTo, down));
    };
    field = el('input', { type: 'text', class: 'cards-amt', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go', value: String(a.minTo),
      'aria-label': kind === 'bet' ? 'Amount to bet' : 'Amount to raise to',
      oninput: () => sync(), onchange: () => sync(true),
      onkeydown: e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        // The field and the button agree before anything is bet: an amount the table changes goes in the field first, its reason kept.
        const typed = parse();
        const to = sync(true);
        if (typed.why || typed.n !== to) return;
        main.click();
      } });
    const preset = (size, text, name) => el('button', { type: 'button', class: 'btn small cards-preset', dataset: { size }, 'aria-label': name, onclick: () => { const z = Pipeline.sizeWhy(a, size); set(z.to, z.why); } }, text);
    const size = el('div', { class: 'cards-size', role: 'group', 'aria-label': kind === 'bet' ? 'How much to bet' : 'How much to raise to' },
      el('div', { class: 'cards-stepper' },
        el('button', { type: 'button', class: 'btn small cards-step', dataset: { step: '-1' }, 'aria-label': `${money(a.unit)} less`, onclick: () => step(-1) }, '−'),
        el('label', { class: 'cards-amt-wrap' }, el('span', { class: 'cards-amt-cur', 'aria-hidden': 'true' }, '$'), field),
        el('button', { type: 'button', class: 'btn small cards-step', dataset: { step: '1' }, 'aria-label': `${money(a.unit)} more`, onclick: () => step(1) }, '+')),
      el('div', { class: 'cards-presets' }, preset('min', 'Min', 'The least'), preset('half', '½ pot', 'Half the pot'), preset('pot', 'Pot', 'The pot'), preset('allin', 'All in', 'All in')),
      note);
    sync();
    return [acts, size];
  }
  /* The hint on a betting round (wave 18): the choice in words, what Stop costs, and the Win (cheat) control at its end. */
  /* The amounts a bet or a raise can be, in words (wave 18): "$4, $8, $12… up to all in ($19)", "$16 or all in ($19)", "all in ($19)". */
  function ladderText(a) {
    if (a.limit) return a.minTo >= a.maxTo ? `all in (${money(a.maxTo)})` : money(a.minTo);
    const b = Math.max(1, a.unit | 0);
    const all = `all in (${money(a.maxTo)})`;
    if (a.minTo >= a.maxTo) return all;
    const steps = [a.minTo];
    for (let x = a.minTo + b; steps.length < 3 && x < a.maxTo && a.maxTo - x >= b; x += b) steps.push(x);
    if (steps.length === 1) return `${money(a.minTo)} or ${all}`;
    const more = steps[steps.length - 1] + b < a.maxTo && a.maxTo - (steps[steps.length - 1] + b) >= b;
    return `${steps.map(money).join(', ')}${more ? '…' : ''} up to ${all}`;
  }
  function betHint(t) {
    const opts = Array.isArray(t.options) ? t.options : [];
    const a = isObj(t.ask) ? t.ask : {};
    let say;
    if (opts[0] === 'call') {
      const call = `Call ${money(a.toCall)}${a.toCall >= a.left ? ' (all in)' : ''}`;
      if (!opts.includes('raise')) say = `${call} or fold${(a.raises | 0) >= Pipeline.MAX_RAISES ? ' (four raises: no more this round)' : ''}. `;
      else if (a.minTo >= a.maxTo) say = `${call}, go ${ladderText(a)}, or fold. `;
      else say = `${call}, raise to ${ladderText(a)}, or fold. `;
    } else if (opts.includes('bet')) say = a.minTo >= a.maxTo ? `Check, or go ${ladderText(a)}. ` : `Check, or bet ${ladderText(a)}. `;
    else say = 'Check. ';
    // Wave 20 (QA N11): a short screen has the choice words alone, the Win (cheat) beside them (shortHint).
    if (shortScreen()) return el('p', { class: 'cards-hint short' }, choiceWords(t), ' ', winButton());
    return el('p', { class: 'cards-hint' }, rulesSaid(t), say, `Stop folds the hand (−${money(t.playerIn)}). `, winButton());
  }
  /* Wave 20 (QA N11): under 600px of height the hint under the table is
     one short line, the choice words and the Win (cheat) ("Check or bet.
     Win (cheat)", "Call, raise or fold.", "Hold, then Draw."), so
     the Win stays in view with the player's cards, the buttons and the
     amount; the terms (on the first deal) and what Stop costs are the
     button row's title and name (actsTitle) and on the status line
     (handStatus). A turn of the phone across 600px draws the hint again
     (shortMq). */
  const shortMq = window.matchMedia('(max-height: 599.98px)');
  const shortScreen = () => shortMq.matches;
  function choiceWords(t) {
    if (t.phase !== 'bet' && t.game !== 'holdem') return 'Hold, then Draw.';
    const opts = Array.isArray(t.options) ? t.options : [];
    const a = isObj(t.ask) ? t.ask : {};
    const raise = a.minTo >= a.maxTo ? 'all in' : 'raise';
    if (opts[0] === 'call') return opts.includes('raise') ? `Call, ${raise} or fold.` : 'Call or fold.';
    if (opts.includes('bet')) return a.minTo >= a.maxTo ? 'Check or all in.' : 'Check or bet.';
    return 'Check.';
  }
  /* Five-card draw's hint before the draw (wave 18; the short line on a short screen, wave 20). */
  function drawHint(t, price) {
    if (shortScreen()) return el('p', { class: 'cards-hint short' }, choiceWords(t), ' ', winButton());
    return el('p', { class: 'cards-hint' }, `${rulesSaid(t)}Pick the cards to hold, then Draw: the rest are replaced, and a round of betting follows. Stop folds the hand (−${money(price)}). `, winButton());
  }
  /* A phone turned (or a window sized) across 600px of height with a hand open: the hint, the button row's name and the status line follow. */
  function shortChanged() {
    const node = $('#feed .f-cards.open');
    const t = shownTable;
    if (!node || !isObj(t) || t.choose || t.result) return;
    const price = Number.isInteger(t.playerIn) ? t.playerIn : Pipeline.foldPrice(t.stake);
    const hint = $('.cards-hint', node);
    if (hint) hint.replaceWith(t.game === 'holdem' || t.phase === 'bet' ? betHint(t) : drawHint(t, price));
    const acts = $('.cards-acts', node);
    if (acts && shortScreen()) actsNamed(acts, t, price);
    else if (acts) for (const k of ['title', 'role', 'aria-label']) acts.removeAttribute(k);
    if (d.turnStatus && !d.turnStatus.classList.contains('nudge')) renderStatus();
  }
  if (shortMq.addEventListener) shortMq.addEventListener('change', shortChanged); else if (shortMq.addListener) shortMq.addListener(shortChanged);
  function actsTitle(t, price) { return `${rulesSaid(t)}Stop folds the hand (−${money(price)}).`; }
  /* The button row on a short screen carries the terms and the Stop price as its title and its group name (QA N11). */
  function actsNamed(acts, t, price) {
    if (!shortScreen()) return acts;
    const said = actsTitle(t, price);
    acts.title = said;
    acts.setAttribute('role', 'group');
    acts.setAttribute('aria-label', said);
    return acts;
  }
  /* The status line on a short screen while the hand waits (QA N11): "Your hand · Stop folds it (−$5)", with the terms on the first deal ("… · $100 to sit, $5 ante, no limit"). */
  function handStatus(t) {
    if (!shortScreen() || !isObj(t) || t.result || t.choose || !Number.isInteger(t.playerIn)) return null;
    const terms = t.first && Number.isInteger(t.ante) ? ` · ${money(t.stake)} to sit, ${money(t.ante)} ante, ${t.structure === 'nolimit' ? 'no limit' : `${money(t.unit)} limit`}` : '';
    return { text: `Your hand · Stop folds it (−${money(t.playerIn)})${terms}`, title: `Your hand. ${actsTitle(t, t.playerIn)}` };
  }
  /* Under the result (wave 20, QA N4): what the move that finished the hand went in as, when the table changed a typed amount ("Your $70 went in as all in $95: that would have left you less than a bet."). */
  function amountWhy(t) { return typeof t.amountWhy === 'string' && t.amountWhy ? el('p', { class: 'cards-why' }, t.amountWhy) : null; }
  /* Under a finished table, the newest only (wave 14, QA #11): how to play the other game next. */
  function nextHint(t) {
    if (t.result === 'caught') return null;
    for (const x of $$('#feed .f-cards .cards-next')) x.remove();
    return el('p', { class: 'cards-next' }, NEXT_HINT);
  }
  function fillCards(node, t) {
    const head = el('p', { class: 'cards-head', id: node.dataset.head || null, tabindex: '-1' }, cardsHead(t));
    node.dataset.game = t.choose ? 'choose' : t.game === 'holdem' ? 'holdem' : 'draw';
    node.classList.toggle('holdem', !t.choose && t.game === 'holdem');
    if (t.choose) { fillChooser(node, t, head); return; }
    const done = !!t.result;
    const holdem = t.game === 'holdem';
    const first = firstOf(t.dealerName);
    const seats = Array.isArray(t.seats) ? t.seats : [];
    const folded = done && (t.folded === true || t.result === 'fold');
    const winners = done && t.result !== 'caught' && Array.isArray(t.winners) ? t.winners : [];
    const winWord = key => (winners.includes(key) ? (winners.length > 1 ? 'splits the pot' : 'takes the pot') : '');
    node.classList.toggle('open', !done);
    const rows = [head];
    if (!holdem) {
      // Five-card draw (wave 10): the dealer's five (and each seat's) face down until the showdown; the player's to hold. Wave 18: then a round of betting after the draw (phase 'bet'), the player's five face up with the new ones marked and each seat's draw said.
      const bet = !done && t.phase === 'bet';
      // A wave 18 hand (it has its ante): folds before or after the draw are told apart, and a hand that took the pot unseen stays face down (hidden).
      const fresh = Number.isInteger(t.ante);
      const pFold = folded && !(fresh && t.player.foldedOn === 1);
      // A card the draw brought (wave 11, S2): a position that side did not hold. A fold heads up before the draw ends the hand before anyone draws; a hand thrown in (wave 14: the win cheat's fold-out) draws nothing.
      const played = side => Array.isArray(side.held) && !side.folded && (done ? !(pFold && (side === t.player || !seats.length)) : bet);
      const drew = (side, i) => played(side) && !side.held.includes(i);
      const drawText = (side, who) => (played(side) ? (side.held.length < 5 ? `${who} draws ${5 - side.held.length}` : `${who} stands pat`) : '');
      const foldWord = side => (fresh && Number.isInteger(side.foldedOn) ? `folds ${DRAW_WHEN[side.foldedOn] || ''}`.trim() : 'folds');
      const other = (side, key, who, cls, deals, extra) => {
        const name1 = firstOf(side.who || who);
        const dw = drawText(side, name1);
        const shown = done && !side.folded && !(side.hidden && !t.marked);
        const cards = side.folded && done ? side.dealt.map(c => (t.marked ? cardFace(c) : cardBack()))
          : shown ? side.final.map((c, i) => cardFace(c, drew(side, i)))
            : (bet || done) && t.marked && Array.isArray(side.final) ? side.final.map((c, i) => cardFace(c, drew(side, i)))
              : side.dealt.map(c => (t.marked ? cardFace(c) : cardBack()));
        const name = done && !side.folded && !side.hidden ? el('p', { class: 'cards-name' }, side.name, dw ? el('span', { class: 'cards-drew' }, ` · ${dw}`) : null)
          : dw && (bet || (done && side.hidden)) ? el('p', { class: 'cards-name' }, el('span', { class: 'cards-drew' }, dw)) : null;
        return seatRow(Object.assign({
          cls, key, who: side.who || who, deals, won: !!winWord(key), status: done ? (side.folded ? foldWord(side) : winWord(key)) : side.status || (side.folded ? 'folds' : ''),
          label: `${name1}'s cards`, cards, name
        }, extra || {}));
      };
      // The read is about the man while his cards are face down: none over a marked deck's (wave 11, M3); after the showdown, whether it was right (S2), only when his cards are shown after his draw (wave 14, QA #7: not after a fold heads up, a hand thrown in, cards that took the pot unseen or a win cheat).
      const verdict = done && !t.win && !t.dealer.folded && !t.dealer.hidden && !(pFold && !seats.length);
      const read = t.read && t.read.text && !t.marked ? readLine(t.read, verdict) : null;
      const note = t.marked && !done ? el('p', { class: 'cards-note' }, `Marked deck: you can read ${seats.length ? "everyone's" : `${first}'s`} cards.`) : null;
      rows.push(other(t.dealer, t.dealerId, t.dealerName, 'cards-dealer', true, { read, note }));
      for (const x of seats) rows.push(other(x, x.id, x.who, 'cards-seat'));
      const mine = done || bet;
      rows.push(seatRow({
        cls: 'cards-you', key: 'player', who: 'You', won: !!winWord('player'),
        status: done ? (folded && fresh ? foldWord(Object.assign({}, t.player, { foldedOn: Number.isInteger(t.player.foldedOn) ? t.player.foldedOn : 0 })) : winWord('player')) : t.player.status || '',
        label: mine ? 'Your cards' : 'Your hand: pick the cards to hold',
        cards: mine ? t.player.final.map((c, i) => cardFace(c, drew(t.player, i))) : t.player.dealt.map(cardToggle),
        name: mine ? el('p', { class: 'cards-name' }, t.player.name) : null
      }));
      if (done) rows.push(el('p', { class: 'cards-result', dataset: { result: t.result } }, (CARDS_RESULT[t.result] || (() => ''))(t), el('span', { class: 'cards-cash' }, ` · cash ${money(t.cash)}`)), amountWhy(t), nextHint(t));
      else if (bet) rows.push(potLine(t), ...betActs(t), betHint(t));
      else {
        const price = Number.isInteger(t.playerIn) ? t.playerIn : Pipeline.foldPrice(t.stake);
        rows.push(potLine(t));
        rows.push(actsNamed(el('div', { class: 'cards-acts' },
          el('button', { type: 'button', class: 'btn primary small cards-draw', onclick: e => endHand(e.currentTarget, false) }, drawLabel(5)),
          el('button', { type: 'button', class: 'btn small cards-fold', onclick: e => endHand(e.currentTarget, true) }, `Fold −${money(price)}`)), t, price));
        rows.push(drawHint(t, price));
      }
      node.replaceChildren(...rows.filter(Boolean));
      return;
    }
    // Texas hold'em (wave 13): two cards a seat, the board, a street at a time. A seat's cards are up with a marked deck, or at the end when they were shown (a seat that folded keeps them down).
    const up = side => t.marked || (done && !!side.final);
    const street0 = Math.min(toInt(t.street) || 0, 3);
    const ended = (side, key) => {
      // Open: what the seat did on this street (wave 14, QA #5: a new street starts clean); a fold on an earlier one says when.
      if (!done) return side.folded && Number.isInteger(side.foldedOn) && side.foldedOn < street0 ? `folds ${FOLD_WHEN[side.foldedOn]}` : side.status || (side.folded ? 'folds' : '');
      if (side.folded || (key === 'player' && folded)) return `folds ${FOLD_WHEN[side.foldedOn] || ''}`.trim();
      if (key === 'player' && t.uncontested) return winWord('player') || 'takes the pot';
      return [side.final ? side.name : '', winWord(key)].filter(Boolean).join(' · ');
    };
    // The read's verdict only where the cards were shown at the end (wave 14, QA #7): never on a seat that folded face down, nor after a win cheat.
    const verdict = side => done && !t.win && !side.folded && !!side.final;
    const seatOf = (side, key, who, cls, deals) => seatRow({
      cls, key, who, deals, won: !!winWord(key), status: ended(side, key), label: `${firstOf(who)}'s cards`,
      read: side.read && side.read.text && !t.marked ? readLine(side.read, verdict(side)) : null,
      note: deals && t.marked && !done ? el('p', { class: 'cards-note' }, `Marked deck: you can read ${seats.length ? "everyone's" : `${first}'s`} cards.`) : null,
      cards: side.dealt.map(c => (up(side) ? cardFace(c) : cardBack()))
    });
    rows.push(seatOf(t.dealer, t.dealerId, t.dealerName, 'cards-dealer', true));
    for (const x of seats) rows.push(seatOf(x, x.id, x.who, 'cards-seat', false));
    const shown = done ? (Number.isInteger(t.shown) ? t.shown : 5) : (t.board || []).length;
    // The label follows the board (wave 14, QA #6): five up is the showdown; a hand everyone folded names the street it stopped on.
    const street = done ? (t.uncontested ? STREET_LABELS[street0] : shown === 5 || t.street === 4 ? 'Showdown' : STREET_LABELS[street0]) : STREET_LABELS[street0];
    rows.push(el('div', { class: 'cards-board' },
      el('p', { class: 'cards-top' }, el('span', { class: 'cards-board-k' }, 'The board'), el('span', { class: 'cards-street' }, street)),
      el('div', { class: 'cards-row', role: 'group', 'aria-label': `The board: ${lowerFirst(street)}` }, [0, 1, 2, 3, 4].map(i => (i < shown && t.board && t.board[i] ? cardFace(t.board[i]) : cardBack())))));
    rows.push(seatRow({ cls: 'cards-you', key: 'player', who: 'You', won: !!winWord('player'), status: ended(t.player, 'player'), label: 'Your cards', cards: t.player.dealt.map(c => cardFace(c)) }));
    if (done) rows.push(el('p', { class: 'cards-result', dataset: { result: t.result } }, (CARDS_RESULT[t.result] || (() => ''))(t), el('span', { class: 'cards-cash' }, ` · cash ${money(t.cash)}`)), amountWhy(t), nextHint(t));
    else rows.push(potLine(t), ...betActs(t), betHint(t));
    node.replaceChildren(...rows.filter(Boolean));
  }
  function endHand(btn, fold) {
    const node = btn && btn.closest('.f-cards');
    if (!node || !Pipeline.handOpen) return;
    const hold = $$('.cards-you button.card', node).filter(b => b.dataset.held === 'true').map(b => toInt(b.dataset.i));
    Pipeline.playHand(fold ? { fold: true } : { hold });
  }
  // The head names the group (wave 11, L11: aria-labelledby, so the name is not said twice).
  let cardsSeq = 0;
  function cardsNode(t) {
    const id = `cards-head-${++cardsSeq}`;
    const node = el('section', { class: 'f-item f-cards', role: 'group', 'aria-labelledby': id, dataset: { head: id } });
    fillCards(node, t);
    return node;
  }
  /* The open table in view (wave 11, L3): its head at the top of the story
     when the whole table does not fit (a short phone, Large text, the
     keyboard up), else all of it. */
  function showTable(node, lead) {
    const f = d.feedScroll;
    if (!f || !node || !node.isConnected) return;
    const box = f.getBoundingClientRect();
    const t = node.getBoundingClientRect();
    // A notice shown above the open table (wave 12, M1: the title screen refused) is in view with it.
    const l = lead && lead.isConnected ? lead.getBoundingClientRect() : null;
    const r = l ? { top: Math.min(l.top, t.top), bottom: t.bottom, height: t.bottom - Math.min(l.top, t.top) } : t;
    const gap = 8;
    const top = r.top - box.top + f.scrollTop;
    if (r.height + gap > f.clientHeight) { f.scrollTop = Math.max(0, top - gap); stick = false; d.newBtn.hidden = true; }
    else if (r.bottom > box.bottom || r.top < box.top) { f.scrollTop = Math.max(0, top + r.height + gap - f.clientHeight); stick = nearBottom(); if (stick) d.newBtn.hidden = true; }
  }
  /* An open table drawn again for the next street or move (wave 14, QA #4):
     after a press the player's row, the pot line, the buttons and the Win
     (cheat) control stay in view (with the board above them when it fits
     too), so a phone does not jump back to the head and hide the player's
     cards and the buttons. Left where it is when that is in view already;
     the whole table when it all fits. Wave 19 (QA D5): the first deal of a
     table taller than the story is kept the same way (the head is at the
     top only when the whole table fits). Wave 19 (QA D6): when the player's
     row and everything under it do not fit (a 320px phone at Large text
     with the amount control), the player's cards and the controls (the
     buttons and the amount) are what stays: the cards at the top of the
     story, the hint's end a short scroll below, the board a short scroll
     above. Wave 20 (QA N11): under 600px of height the margin kept above
     and below is 4px, not 8px, so with the short hint the player's cards
     and everything under them, the Win (cheat) too, fit at 320×568. */
  function keepHand(node) {
    const f = d.feedScroll;
    if (!f || !node || !node.isConnected) return;
    const gap = shortScreen() ? 4 : 8;
    const room = f.clientHeight - 2 * gap;
    const you = $('.cards-you', node);
    const last = node.lastElementChild;
    if (node.getBoundingClientRect().height <= room || !you || !last) { showTable(node); return; }
    const box = f.getBoundingClientRect();
    const rect = el => el.getBoundingClientRect();
    const bottom = rect(last).bottom;
    const board = $('.cards-board', node);
    const boardTop = board ? rect(board).top : null;
    const youTop = rect(you).top;
    const row = $('.cards-row', you);
    // The cards' own top (wave 20: the row's padding above five-card draw's cards is not kept in view; a held card raised is).
    const tops = row ? $$('.card', row).map(c => rect(c).top) : [];
    const cardsTop = row ? Math.max(youTop, (tops.length ? Math.min(...tops) : rect(row).top) - gap / 2) : youTop;
    const ctrls = $$('.cards-acts, .cards-size', node);
    const ctrlEnd = ctrls.length ? Math.max(...ctrls.map(x => rect(x).bottom)) : bottom;
    // The most that fits, from the top: the board and all under it; the player's row and all under it; the player's cards and all under them.
    const top = [boardTop, youTop, cardsTop].find(x => x !== null && bottom - x <= room);
    let shift;
    if (top !== undefined) {
      if (top >= box.top + gap && bottom <= box.top + gap + room) return;
      // The end of the table at the foot of the story.
      shift = bottom - (box.top + gap + room);
    } else if (ctrlEnd - cardsTop <= room) {
      // Not even that: the player's cards at the top of the story, the controls under them.
      if (cardsTop >= box.top + gap && ctrlEnd <= box.top + gap + room) return;
      shift = cardsTop - (box.top + gap);
    } else shift = ctrlEnd - (box.top + gap + room); // the buttons first
    f.scrollTop = Math.max(0, f.scrollTop + shift);
    stick = nearBottom();
    if (stick) d.newBtn.hidden = true;
  }
  /* Where the focus goes in an open table after a press (wave 15): its
     first button that can be pressed (Check, Call, Draw), else the
     player's row (made focusable for it). */
  function tableFocus(node) {
    const btn = $$('.cards-acts button', node).find(b => !b.disabled);
    if (btn) return btn;
    const you = $('.cards-you', node);
    if (you && !you.hasAttribute('tabindex')) you.setAttribute('tabindex', '-1');
    return you || $('.cards-head', node);
  }
  /* The cash where it shows (wave 11, M2): the top bar and the Character
     panel, as soon as a hand moves it (the turn is still running, so the
     game is not drawn again until it ends). */
  function cashText(n) { return currency() ? money(n) : String(n); }
  function showCash() {
    const s = State.current;
    if (!s || !d.tbGold) return;
    d.tbGold.textContent = cashText(s.player.gold);
    d.tbGoldUnit.textContent = currency() ? '' : ' gold';
    for (const x of $$('.char-cash')) x.textContent = cashText(s.player.gold);
  }
  /* Quiet lines whose feed line was taken back (a failed turn) are not kept. */
  function prunePending() {
    for (let i = pendingNodes.length - 1; i >= 0; i--) if (!pendingNodes[i].isConnected) { pendingNodes.splice(i, 1); pendingNotes.splice(i, 1); }
  }
  /* Hand the quiet lines to the caller (App, as a log entry's notes). */
  function takeNotes() {
    prunePending();
    const out = pendingNotes.slice();
    pendingNotes.length = 0;
    pendingNodes.length = 0;
    return out;
  }
  /* Streaming: the narration is written into a node screen readers skip,
     with the log quiet; the finished text is then put in once, so it is
     read out once, not after every chunk. */
  let streaming = 0;
  function liveOff() { streaming += 1; d.feed.setAttribute('aria-live', 'off'); }
  function liveOn() { streaming = 0; d.feed.setAttribute('aria-live', 'polite'); }
  const feed = {
    add(node) { d.feed.append(node); afterAppend(); return node; },
    input(text, sp) { inferStage('parse'); Object.assign(turnMark, { open: true, roll: false, narr: false }); return feed.add(inputNode(text, sp)); },
    roll(r) { if (r) turnMark.roll = true; return r && Storage.settings().showRolls ? feed.add(rollNode(r)) : null; },
    narration(text, mock) { turnMark.narr = true; const node = feed.add(narrationNode(text, mock, liveTurn())); releaseNote(); return node; },
    beginNarration(opts) {
      turnMark.narr = true;
      const label = turnLabel(liveTurn());
      const data = Object.assign({}, opts && opts.mock ? { mock: '1' } : {}, label ? { turnLabel: label } : {});
      const node = el('div', { class: 'f-item f-narr pending', 'aria-busy': 'true', 'aria-hidden': 'true', dataset: Object.keys(data).length ? data : null });
      fillParas(node, '');
      liveOff();
      inferStage('narrate');
      return feed.add(node);
    },
    stream(node, soFar) { fillParas(node, soFar); afterAppend(); if (soFar) releaseNote(); },
    endNarration(node, text) {
      liveOn();
      node.classList.remove('rewriting');
      node.removeAttribute('aria-hidden');
      fillParas(node, text);
      node.classList.remove('pending');
      node.removeAttribute('aria-busy');
      afterAppend();
      releaseNote();
      inferStage('bookkeep');
    },
    /* UI.feed.rewriting(node, on): the first draft stays, dimmed, under
       "Rewriting…" while the second is written (Pipeline buffers it and ends
       with endNarration). */
    rewriting(node, on) {
      if (!node) return;
      node.classList.toggle('rewriting', !!on);
      const label = $('.f-rewriting', node);
      if (on && !label) { const tag = $('.f-tag', node) || $('.f-turn-h', node); if (tag) tag.after(rewritingLabel()); else node.prepend(rewritingLabel()); }
      if (!on && label) label.remove();
      if (on) inferStage('rewrite');
    },
    notice(text, kind) {
      if (kind === 'recap') return feed.add(recapNode(text));
      if (kind === 'help') return feed.add(helpNode(text));
      const t = String(text);
      // The text in its own span, so the buttons can follow it and "kept in the box" can be rewritten alone (restoreAction).
      return feed.add(el('p', { class: 'f-item f-notice' + (kind ? ' ' + kind : '') }, el('span', { class: 'f-notice-text' }, t), kind === 'error' ? noticeActs(t) : null));
    },
    /* A quiet line that is always shown (damage, story points), unlike rolls.
       It is also kept (UI.pendingNotes) for the log entry of the turn that
       commits next, so it is there after a reload; outside a turn it goes
       on the newest entry straight away. Kept with where it was printed
       (wave 6, R7): the time the feed showed (shownTime), and at: 'start'
       (in a turn, before its roll and narration: a reroll's "Cheat:
       success", what a /wait's hours brought), 'before' (after the roll,
       before the narration: damage, a natural 20) or 'after'; App's
       attachNotes writes it against the entry it goes on. */
    quiet(text) {
      const t = shownTime();
      const node = feed.add(quietNode(text));
      const at = !turnMark.open || turnMark.narr ? 'after' : turnMark.roll ? 'before' : 'start';
      pendingNotes.push(Object.assign({ text: String(text), at }, t ? { day: t.day, phase: t.phase } : {}));
      pendingNodes.push(node);
      if (!busy && !Pipeline.busy) Promise.resolve().then(() => { if (!busy && !Pipeline.busy) App.flushNotes(); });
      return node;
    },
    divider(day, phase) { return feed.add(dividerNode(day, phase)); },
    /* The card table (wave 10, Pipeline.gamble): the hand as dealt, open
       for the player's holds; the focus goes to the table's head (wave 11,
       M7: never a card, which would look held) when it was on the box,
       Send or nowhere, and the table is scrolled into view (showTable).
       opts.replay (a /reroll of the hand): drawn where it goes, no focus.
       cardsDone(node, record) turns the same block into the finished table
       (the focus, if it was in it, back to the box). */
    cards(t, opts) {
      const node = feed.add(cardsNode(t));
      if (opts && opts.replay) return node;
      const head = $('.cards-head', node);
      if (screen === 'game' && head && focusStillOnComposer()) moveFocus(head);
      // Wave 19 (QA D5): a dealt table taller than the story shows the player's row and the controls (keepHand), not its head; the chooser as before.
      if (t.choose) showTable(node); else keepHand(node);
      shownTable = t;
      tableRedrawn();
      return node;
    },
    /* The same open table drawn again (wave 13): the chooser's game dealt,
       or the next street at hold'em. A focus that was in the table goes
       back into it (the buttons it was on are new), and the table is kept
       in view as it grows. Wave 14 (QA #4): only the chooser's table
       turning into the dealt one is shown from its head (it first appears
       then); a street or a move keeps the player's row and the buttons in
       view (keepHand). Wave 15: the head takes the focus only then too;
       after a press the focus goes to the first button the table offers
       now (it is in view), or the player's row when there is none, never
       to a head scrolled out of view. */
    cardsShow(node, t) {
      if (!node || !node.isConnected) return node;
      const had = node.contains(document.activeElement);
      const first = node.dataset.game === 'choose';
      fillCards(node, t);
      if (had && screen === 'game') moveFocus(first ? $('.cards-head', node) : tableFocus(node));
      // Wave 19 (QA D5): the first deal too keeps the player's row and the controls in view (the whole table when it fits).
      keepHand(node);
      shownTable = t;
      tableRedrawn(t);
      return node;
    },
    /* The hand is played (wave 12, M1): the story is followed again, from
       the result line on (the table's head may have been held at the top
       of a short phone, or the tip under it, while the hand was open). */
    cardsDone(node, t) {
      if (!node || !node.isConnected) return null;
      const had = node.contains(document.activeElement);
      fillCards(node, t);
      if (had) focusComposer();
      scrollToBottom();
      shownTable = null;
      tableRedrawn(t);
      return node;
    },
    /* The dealer holding the player to the limit (wave 18, amendment 2): his
       line under the open table's buttons, above the hint, until the table
       is drawn again; the table stays in view and the focus where it is. */
    cardsSay(node, text) {
      if (!node || !node.isConnected || !node.classList.contains('open')) return null;
      let p = $('.cards-said', node);
      if (!p) {
        p = el('p', { class: 'cards-said', role: 'status' });
        const hint = $('.cards-hint', node);
        if (hint) hint.before(p); else node.append(p);
      }
      p.textContent = String(text);
      keepHand(node);
      return p;
    },
    /* Another tab took the game over with the hand open here (wave 12, L3):
       the table stays as dealt, its buttons off, with a line saying so. */
    cardsVoid(node) {
      if (!node || !node.isConnected) return null;
      const had = node.contains(document.activeElement);
      node.classList.remove('open');
      node.classList.add('void');
      for (const b of $$('button, input', node)) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      // A chooser had no hand dealt (wave 14, QA #19; Pipeline takes that turn back and says so in a notice).
      const line = el('p', { class: 'cards-void' }, node.dataset.game === 'choose' ? 'Another tab took over; the table is closed here.' : 'Another tab took over; this hand is void here.');
      const hint = $('.cards-hint', node);
      if (hint) hint.remove();
      const acts = $('.cards-acts', node);
      if (acts) acts.before(line); else node.append(line);
      if (had) { const head = $('.cards-head', node); if (head) moveFocus(head); }
      return node;
    },
    /* A notice while the hand is open (wave 12, M1 and L6: the title screen
       refused): above the table, so it and the table's head are in view
       together on a short phone, with no "New" pill over the buttons; the
       focus goes to the table's head. Not at an open table: a notice. */
    handNotice(text) {
      const node = $('#feed .f-cards.open');
      if (!node) return feed.notice(text);
      const n = el('p', { class: 'f-item f-notice' }, el('span', { class: 'f-notice-text' }, String(text)));
      node.before(n);
      showTable(node, n);
      const head = $('.cards-head', node);
      if (screen === 'game' && head) moveFocus(head);
      return n;
    },
    /* mark()/rollback(mark): take a failed turn's lines back out of the feed. */
    mark() { return d.feed.childElementCount; },
    rollback(mark) {
      while (d.feed.childElementCount > mark) d.feed.lastElementChild.remove();
      prunePending();
      if (streaming) liveOn();
    },
    clear() { d.feed.replaceChildren(); prunePending(); liveOn(); }
  };
  /* The small Undo link for the newest line the player sent (not while a
     turn runs). One button, #undo-btn, outside the story's live region (so
     it is not read out again with every turn), laid over the line's right
     edge (placeUndo). The player on it keeps it: while a turn runs it stays
     where it is, marked off; when it has to go, the focus goes to the box
     (a phone: Send, so no keyboard comes up) before it does. */
  let undoLine = null;
  function markUndo() {
    if (!d.feed || !d.undoRow) return;
    for (const x of $$('.f-input.has-undo', d.feed)) x.classList.remove('has-undo');
    const s = State.current;
    const inputs = $$('.f-input', d.feed);
    const last = inputs[inputs.length - 1] || null;
    // Wave 16: also while a hand is open at cards (its turn is taken back, free), and the link's name says how many steps there are.
    const hand = Pipeline.handOpen;
    const ok = !!s && !State.muted && !Storage.readOnly && !(s.player && s.player.dead) && !!last && (hand || (!busy && !Pipeline.busy && State.undoDepth() >= 1));
    const n = State.undoDepth();
    const more = `${n} can be taken back`;
    d.undoBtn.title = hand ? `Take back this turn and its hand, free (/undo; ${more})` : `Take back the last turn (/undo; ${more})`;
    d.undoBtn.setAttribute('aria-label', hand ? `Undo this turn and its hand, free (${more})` : `Undo the last turn (${more})`);
    const focused = document.activeElement === d.undoBtn;
    if (!ok && focused && (busy || Pipeline.busy) && !Storage.readOnly && undoLine && undoLine.isConnected) {
      undoLine.classList.add('has-undo');
      d.undoBtn.setAttribute('aria-disabled', 'true');
      placeUndo();
      return;
    }
    d.undoBtn.removeAttribute('aria-disabled');
    undoLine = ok ? last : null;
    if (!ok) {
      if (focused) { const to = [isMobile() ? d.send : d.cmd, d.send, d.cmd].find(focusableNow); if (to) moveFocus(to); }
      d.undoRow.hidden = true;
      return;
    }
    last.classList.add('has-undo');
    d.undoRow.hidden = false;
    placeUndo();
  }
  /* Lay the Undo link over its line: its right edge on the line's, its
     bottom 9px below the line's text (as when it sat in the line's row). */
  function placeUndo() {
    if (!d.undoRow || d.undoRow.hidden || !undoLine || !undoLine.isConnected) return;
    const box = d.feedScroll.getBoundingClientRect();
    const r = undoLine.getBoundingClientRect();
    const b = d.undoBtn;
    b.style.left = Math.round(r.right - box.left + d.feedScroll.scrollLeft - b.offsetWidth) + 'px';
    b.style.top = Math.round(r.bottom - box.top + d.feedScroll.scrollTop + 9 - b.offsetHeight) + 'px';
  }
  /* After the first narration of a new game: three lines on how to play,
     once per browser, until closed. The third says where ⋯ and the panels
     are in this layout, and is said again when the layout changes (a
     tablet turned, a window narrowed past 900px). */
  const TIP_WHERE = {
    phone: 'Type / or press ⋯ (at the end of the tabs, or beside Do / Say while you type) for commands. The tabs above the box keep track of people, places and your journal.',
    laptop: 'Type / or press ⋯ for commands. The panel on the right keeps track of people, places and your journal.'
  };
  function tipWhere() { return isMobile() ? TIP_WHERE.phone : TIP_WHERE.laptop; }
  function syncTip() { const p = $('.f-tip .f-tip-where'); if (p && p.textContent !== tipWhere()) p.textContent = tipWhere(); }
  /* Wave 44: two or three things to try in the scene the game opened on,
     from the engine (so they stay true when the town is edited): someone
     here to talk to (the first person the opening scene introduces, by
     name once known, else by role: npcLabel), a place next door to walk to
     (the first exit that is found, open today and not someone's house),
     and one thing here to look at (the last of the place's other names
     that is not part of its name, else the place). Each is
     { kind: 'talk' | 'walk' | 'look', text, id }. */
  const PRIVATE_TYPES = ['house', 'bighouse', 'apartment', 'trailer'];
  function openingTries() {
    const s = State.current;
    if (!s || State.muted || !isObj(s.player)) return [];
    const l = State.loc(s.player.locationId);
    if (!l) return [];
    const out = [];
    const who = State.npcsAt(l.id)[0];
    if (who) out.push({ kind: 'talk', text: `I talk to ${npcLabel(who)}`, id: who.id });
    const next = (Array.isArray(l.exits) ? l.exits : []).map(id => State.loc(id))
      .find(x => x && x.discovered !== false && !PRIVATE_TYPES.includes(x.type) && !State.isClosed(x));
    if (next) out.push({ kind: 'walk', text: `I walk over to ${next.name.replace(/^The /, 'the ')}`, id: next.id });
    const words = new Set(String(l.name).toLowerCase().replace(/['’]s\b/g, '').split(/[^a-z]+/).filter(Boolean));
    const aka = (Array.isArray(l.aka) ? l.aka : []).filter(a => typeof a === 'string' && /^the /i.test(a) && !a.toLowerCase().slice(4).split(/[^a-z]+/).some(w => words.has(w)));
    out.push({ kind: 'look', text: aka.length ? `I look at ${aka[aka.length - 1]}` : `I look around ${l.name.replace(/^The /, 'the ')}`, id: l.id });
    return out.slice(0, 3);
  }
  function tipTry() {
    const tries = openingTries();
    if (!tries.length) return null;
    const kids = [el('strong', null, 'Try'), ' '];
    tries.forEach((t, i) => {
      if (i) kids.push(i === tries.length - 1 ? ' or ' : ', ');
      kids.push(el('span', { class: 'f-tip-act', dataset: { kind: t.kind, id: t.id } }, `“${t.text}”`));
    });
    kids.push('.');
    return el('p', { class: 'f-tip-try' }, kids);
  }
  /* Phone on its side with the keyboard up (CSS at the end of the sheet):
     the tip is one line, "Tips", that opens on a tap. The tap keeps the
     focus in the box (pointerdown is not let through), so the keyboard
     stays up. */
  function toggleTip(e) {
    const t = e.target.closest('.f-tip');
    if (!t) return;
    const open = !t.classList.contains('open');
    t.classList.toggle('open', open);
    e.target.closest('.f-tip-toggle').setAttribute('aria-expanded', String(open));
    afterAppend();
  }
  function showTip() {
    if (!d.feedAfter || Storage.settings().tipSeen || $('.f-tip')) return null;
    Storage.saveSettings({ tipSeen: true });
    tipTurns = 0;
    const keep = e => e.preventDefault();
    const tries = tipTry();
    const tip = el('aside', { class: 'f-tip', 'aria-label': 'How to play' },
      el('button', { type: 'button', class: 'f-tip-toggle', 'aria-expanded': 'false', 'aria-controls': 'f-tip-body', onpointerdown: keep, onmousedown: keep, onclick: toggleTip }, 'Tips'),
      el('div', { class: 'f-tip-body', id: 'f-tip-body' },
        tries,
        el('p', null, el('strong', null, 'Do'), tries ? ' is what you do, like those; ' : ' is what you do ("I look around"); ', el('strong', null, 'Say'), ' is your exact words, to whoever is picked.'),
        el('p', null, el('strong', null, 'Wait'), ' (the button, with the box empty) lets the people here make the next move.'),
        el('p', { class: 'f-tip-where' }, tipWhere())),
      el('button', { type: 'button', class: 'bar-x', 'aria-label': 'Close the tip', onclick: e => { const t = e.target.closest('.f-tip'); if (t) t.remove(); focusComposer(); } }, '×'));
    d.feedAfter.append(tip);
    afterAppend();
    return tip;
  }
  function rebuildFeed() {
    const s = State.current;
    // Wave 45: a control in the story (Try again, a card, Open Settings) goes with the old feed; the focus is not dropped to the page.
    const a = document.activeElement;
    const hadFocus = !!a && a !== d.feed && (d.feed.contains(a) || (d.feedAfter && d.feedAfter.contains(a)));
    try { rebuildFeedNodes(s); } finally { if (hadFocus && !(document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) refocusAfterFeed(); }
  }
  /* The focus after the story was drawn again: the box (a phone: Send, so no keyboard pops up), else the story itself. */
  function refocusAfterFeed() {
    if (screen !== 'game') return;
    const to = [isMobile() ? d.send : d.cmd, d.send].find(focusableNow);
    if (to) to.focus({ preventScroll: true }); else focusFeed();
  }
  function rebuildFeedNodes(s) {
    feed.clear();
    // A load, a new game or an undo: Say mode starts again from the default addressee, and an open editor closes.
    composer.chosen = false;
    if (editing) { editing = null; renderPanel(); }
    renderComposer();
    if (!s) return;
    const showRolls = Storage.settings().showRolls;
    for (const c of s.chronicle) d.feed.append(el('div', { class: 'f-chronicle' }, el('p', null, c.summary)));
    /* In the order it was shown (wave 6, the round-5 playtest's R7): the
       divider of the time the input was given (from, else the entry's own)
       when the feed does not show it already, the input, the entry's own
       divider after it (a /wait, a /rest), its quiet lines printed before
       its roll, the roll, those printed before the narration, the
       narration, and the rest; a divider before any line whose time is not
       the one shown (the new phase a turn ran into, a clock set). A plain
       string note is the entry's time, after the narration. */
    let shown = null;
    const at = (day, phase) => {
      const key = `${day}|${phase}`;
      if (key !== shown) d.feed.append(dividerNode(day, phase));
      shown = key;
    };
    const quietAt = (e, n) => {
      if (Number.isInteger(n.day) && n.phase) at(n.day, n.phase); else at(e.day, e.phase);
      d.feed.append(quietNode(n.text));
    };
    for (const e of s.log) {
      const notes = (Array.isArray(e.notes) ? e.notes : []).map(n => (typeof n === 'string' ? { text: n } : n)).filter(n => isObj(n) && typeof n.text === 'string' && n.text);
      const where = k => notes.filter(n => (n.at === 'start' || n.at === 'before' ? n.at : 'after') === k);
      if (isObj(e.from)) at(e.from.day, e.from.phase); else at(e.day, e.phase);
      if (e.input) d.feed.append(inputNode(e.input, e));
      for (const n of where('start')) quietAt(e, n);
      at(e.day, e.phase);
      // The card table as it ended (wave 10), before the marked deck's roll.
      if (isObj(e.cards)) d.feed.append(cardsNode(e.cards));
      if (e.roll && e.roll.line && showRolls) d.feed.append(rollNode(e.roll));
      for (const n of where('before')) quietAt(e, n);
      if (e.narration) { at(e.day, e.phase); d.feed.append(narrationNode(e.narration, e.mock === true, e.turn)); }
      // The quiet lines of that turn (added to the map, edited someone, damage), kept with it.
      for (const n of where('after')) quietAt(e, n);
    }
    at(s.time.day, s.time.phase);
    feedPlace = null;
    if (d.feedAfter) d.feedAfter.replaceChildren();
    markUndo();
    scrollToBottom();
  }
  // ----- composer and autocomplete -----
  function autosize() {
    const ta = d.cmd;
    // An empty box is one line, whatever the placeholder would wrap to.
    if (!ta.value) { ta.style.height = ''; ta.style.overflowY = 'hidden'; return; }
    ta.style.height = 'auto';
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || 24;
    const borders = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    // Four lines, then it scrolls; three on a phone on its side with the keyboard up, so the story keeps its strip (compactComposer).
    const max = lh * (compactComposer() ? 3 : 4) + pad + borders;
    const want = ta.scrollHeight + borders;
    ta.style.height = Math.min(want, max) + 'px';
    ta.style.overflowY = want > max + 1 ? 'auto' : 'hidden';
  }
  /* While a turn or arrival is running, nothing may load or start a game
     (App refuses those too): New game, Continue, Load and Import are off.
     The box stays usable: Send becomes Stop (Pipeline.abort), or queues the
     next line while the town is being updated (Pipeline.acceptsQueue). */
  function setBusy(b) {
    const was = busy;
    busy = !!b;
    // The turn is over: a quiet line from now on comes after its narration (turnMark).
    if (!busy) turnMark.open = false;
    // No aria-busy on the story's log: a screen reader honouring it could hold back or drop the finished narration (the
    // streaming node is aria-hidden until endNarration puts the text in, which is the one thing read out).
    d.btnNew.disabled = busy;
    d.btnLoad.disabled = busy;
    d.btnImport.disabled = busy;
    if (screen === 'title') d.btnContinue.disabled = busy || !Storage.hasAutosave();
    // A turn that ends while the title screen is up (wave 11, H1): Continue, New game and Load come back, and Continue names the game as it is now.
    if (screen === 'title' && was && !busy) renderTitle();
    d.btnUpdate.disabled = busy;
    d.setReread.disabled = busy || !gameLoaded();
    $$('[data-action="load"], [data-action="restore"]', d.slotList).forEach(btn => { btn.disabled = busy || btn.dataset.filled !== '1'; });
    $$('[data-action="update"]', d.slotList).forEach(btn => { btn.disabled = busy; });
    // A turn has started: a "Go to" chip on the map goes away, and so does the actions list.
    if (busy && mapPick) setPick(null);
    if (busy) closeActions();
    // People: no edit starts or saves, and no pronoun changes, while a turn runs; Places: no Go there (UI.canAct, read only too).
    // A control the player is on is never disabled in place: Go there and the chip (what starts a walk) keep the focus,
    // marked off; Edit, Save and a pronoun chip hand it to their card's head (Save: to Cancel) first.
    const why = actBlock();
    $$('.pcard-edit, .pedit-save, .pcard-pchip, [data-go], .map-go', d.panelBody).forEach(btn => {
      if (why && btn === document.activeElement && !btn.matches('[data-go], .map-go')) {
        const card = btn.closest('.pcard');
        const to = btn.classList.contains('pedit-save') ? $('.pedit-cancel', card || d.panelBody) : card ? $('.pcard-head', card) : null;
        moveFocus(focusableNow(to) ? to : document.getElementById('tab-' + tab));
      }
      setOff(btn, !!why);
      if (why) btn.title = why; else btn.removeAttribute('title');
    });
    // A new turn: an older failed turn's Try again is out of date (the focus, if it was on one, goes to the composer first).
    if (busy && !was) for (const x of $$('.f-notice-acts', d.feed)) { if (x.contains(document.activeElement)) focusComposer(); x.remove(); }
    if (busy && !was) {
      if (!status.fromPipeline && status.stage === 'idle') setStage('busy');
    } else if (!busy && was) {
      if (Api.usage && Api.usage.turn && Api.usage.turn.calls > 0) sessionTurns += 1;
      spendNotice(); // Wave 43: the turn that crossed the spending ceiling says so, once
      if (streaming) liveOn();
      if (!status.fromPipeline) setStage('idle');
      else Promise.resolve().then(() => { if (!busy && !Pipeline.busy && Pipeline.acceptsQueue !== true && status.stage !== 'idle') setStage('idle'); });
      // The tip sits after the story, so once the player has played a couple of turns it goes.
      tipTurns += 1;
      if (tipTurns > 2) { const tip = $('.f-tip'); if (tip) tip.remove(); }
    }
    markUndo();
    syncSendLabel();
  }
  // ----- the status line -----
  const STAGE_TEXT = { parse: 'Reading your action…', cards: 'Your hand', choose: "Choose the game: Five-card draw or Texas hold'em. Stop leaves the table (nothing lost).", narrate: 'Writing…', rewrite: 'Rewriting…', bookkeep: 'Updating the town…', chronicle: 'Summarising…', busy: 'Working…' };
  let tipTurns = 0;
  let nudgeTimer = null;
  let nudgeAgain = null; // a nudge read again from the hand when the table is drawn again (handNudge)
  let tableNote = null; // a typed move's note, shown when the table is drawn again for it
  let noteHeld = false; // that note, on a table its move finished, kept until the narration arrives (wave 20, QA N4)
  let shownTable = null; // the open table as last drawn (wave 20, QA N11: the status line on a short screen reads it)
  /* Pipeline.setStatusListener: { stage, message } at each step of a turn. */
  function onPipelineStatus(ev) {
    status.fromPipeline = true;
    const stage = ev && typeof ev.stage === 'string' ? ev.stage : 'idle';
    if (stage === 'parse') status.queued = false;
    setStage(stage, ev && typeof ev.message === 'string' ? ev.message : '');
    // A hand open at cards (the 'cards' and 'choose' stages) brings the Undo link; the narration after it takes it away (wave 16).
    markUndo();
  }
  /* Without a Pipeline that reports, the feed says where the turn is. */
  function inferStage(stage) { if (!status.fromPipeline && (busy || Pipeline.busy)) setStage(stage); }
  function setStage(stage, message) {
    status.stage = stage;
    if (stage === 'idle') { status.queued = false; status.queuedText = ''; }
    // A table is the status line's only while its hand waits (wave 20, QA N11): one voided or taken back is not the next hand's.
    if (stage !== 'cards') shownTable = null;
    renderStatus(message);
    syncSendLabel();
  }
  /* Wave 45: the status line's words, also put in its live region (#turn-status-live, a polite role=status that is never
     hidden, so a line shown after the bar was hidden is still read out); the same words are not said twice. */
  function setStatusText(text) {
    const t = String(text || '');
    d.turnStatusText.textContent = t;
    if (d.turnStatusLive && d.turnStatusLive.textContent !== t) d.turnStatusLive.textContent = t;
  }
  function renderStatus(message) {
    if (!d.turnStatus) return;
    // A typed amount's note on the hand it finished stays through "Writing…" until the narration arrives (wave 20, QA N4: releaseNote).
    if (noteHeld) { if (status.stage === 'cards' || status.stage === 'narrate') return; noteHeld = false; }
    const on = status.stage !== 'idle';
    d.turnStatus.hidden = !on;
    d.turnStatus.classList.remove('nudge');
    // A short screen (wave 20, QA N11): while the hand waits, what Stop costs (and the terms on the first deal), on one line.
    const hs = on && status.stage === 'cards' ? handStatus(shownTable) : null;
    d.turnStatus.classList.toggle('short-hand', !!hs);
    if (hs) d.turnStatusText.title = hs.title; else d.turnStatusText.removeAttribute('title');
    setStatusText(on ? (hs ? hs.text : STAGE_TEXT[status.stage] || message || STAGE_TEXT.busy) : '');
    // The queued line is shown, not just a pill, with × to take it back.
    const q = on && status.queued;
    d.queuedNote.hidden = !q;
    d.turnStatus.classList.toggle('has-queued', q);
    if (q) {
      const held = typeof Pipeline.queued === 'string' ? Pipeline.queued : status.queuedText;
      d.queuedText.textContent = held ? `Next: “${held}”` : Pipeline.queued === '' ? 'Next: Wait' : 'Queued';
      d.queuedNote.title = held || '';
    }
  }
  /* × on the queued line: it does not run; its text goes back in the box
     (or, if something new is typed there, into a notice). */
  function cancelQueued() {
    let text = null;
    try { text = Pipeline.cancelQueued(); } catch (e) { console.error(e); }
    const back = typeof text === 'string' && text ? text : status.queuedText;
    status.queued = false;
    status.queuedText = '';
    renderStatus();
    if (back) restoreAction(back);
    syncSendLabel();
    // The × is gone: the focus goes to the box (a phone: the Send button, so no keyboard pops up).
    (isMobile() ? d.send : d.cmd).focus({ preventScroll: true });
    return true;
  }
  /* Enter while a turn runs (and nothing can be queued): the line stays in
     the box and the status line says why. text: what it says instead
     (QUEUE_FULL: a line typed while one already waits). */
  function nudge(text, again) {
    if (!d.turnStatus || d.turnStatus.hidden) return;
    noteHeld = false;
    d.turnStatus.classList.add('nudge');
    d.turnStatus.classList.remove('short-hand');
    d.turnStatusText.removeAttribute('title');
    setStatusText(text || 'Still working on the last turn. Your line stays in the box; press Stop to cancel that turn.');
    nudgeAgain = typeof again === 'function' ? again : null;
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => renderStatus(), 2600);
  }
  /* The open table drawn again (wave 19, QA D4: the status line never
     contradicts the table, not even for the 2.6 s a nudge lasts): a
     typed move's note (tableNote) shows now; a nudge about the hand is
     read again from the hand as it stands (nudgeAgain: handNudge); any
     other nudge (the dealer's limit, "check" facing a bet) was about the
     table before the move and goes at once. */
  function tableRedrawn(t) {
    const note = tableNote;
    tableNote = null;
    // Wave 20 (QA N4): on a table the move finished, the note stays until the narration arrives.
    if (note) { nudge(note); if (isObj(t) && t.result) noteHeld = true; return; }
    if (!d.turnStatus) return;
    // Wave 20 (QA N11): the status line follows the table drawn (on a short screen it says what Stop costs now).
    if (!d.turnStatus.classList.contains('nudge')) { if (status.stage === 'cards') renderStatus(); return; }
    // The open table as drawn (the hand waits for the player right after this, so its kind is the table's own).
    if (nudgeAgain && isObj(t) && !t.result && !t.choose) { setStatusText(nudgeAgain(t, t.game === 'holdem' ? 'holdem' : t.phase === 'bet' ? 'drawbet' : 'draw')); return; }
    clearTimeout(nudgeTimer);
    renderStatus();
  }
  /* The narration has arrived (wave 20, QA N4): a held note gives way to the turn's stage. */
  function releaseNote() {
    if (!noteHeld) return;
    noteHeld = false;
    clearTimeout(nudgeTimer);
    renderStatus();
  }
  function turnRunning() { return busy || !!Pipeline.busy; }
  function canQueue() { return turnRunning() && Pipeline.acceptsQueue === true; }
  /* A line (or a Wait) already waits in the Pipeline's queue, which keeps one: another stays in the box, and the status line and Send's title say why. */
  function lineWaiting() { return canQueue() && (typeof Pipeline.queued === 'string' || status.queued); }
  const QUEUE_FULL = 'One line is already waiting. Press × to change it.';
  // Stop also while the town is being updated (Pipeline.canStop: the narration stays), unless a line typed then is to be queued.
  function canStop() { return turnRunning() && Pipeline.canStop && !(canQueue() && d.cmd && d.cmd.value.trim()); }
  /* The button: Wait with nothing typed, Send, Stop while a turn runs (it
     can be stopped), Send again while the next line can be queued. */
  function syncSendLabel() {
    if (!d.send) return;
    const was = d.send.textContent;
    const empty = !d.cmd.value.trim();
    const stop = canStop() && !(canQueue() && !empty);
    d.send.classList.toggle('stop', stop);
    d.send.classList.toggle('wait', !stop && empty);
    d.send.classList.toggle('primary', !stop && !empty);
    // Off without dropping the focus: pressed (Wait, Send), the button keeps it through the turn (setOff).
    if (stop) {
      d.send.textContent = 'Stop';
      d.send.title = 'Stop this turn';
      setOff(d.send, !!Storage.readOnly);
    } else {
      d.send.textContent = empty ? 'Wait' : 'Send';
      d.send.title = Storage.readOnly ? READ_ONLY_NOTICE : lineWaiting() ? QUEUE_FULL : canQueue() ? 'Send: it runs as soon as this turn is done' : empty ? 'Say nothing and see what they do' : 'Send';
      setOff(d.send, !!Storage.readOnly || (turnRunning() && !(canQueue() && !empty)));
    }
    // A new label is a new width for the box beside it (Wait, Send and Stop differ by a few px): what is in it is measured again, so no last line is cut off.
    if (d.send.textContent !== was && d.cmd.value && d.cmd.getClientRects().length) autosize();
  }
  function sendOrStop() {
    if (d.send.getAttribute('aria-disabled') === 'true') { if (Storage.readOnly) toast(READ_ONLY_NOTICE); return; }
    if (d.send.classList.contains('stop')) { stopTurn(); return; }
    send(true);
  }
  /* After a turn sent from the box or the button: the focus goes back to the
     box on a laptop only if it is still on the box, the button or nowhere
     (a field the player moved to meanwhile, the People search, keeps it). */
  function focusStillOnComposer() {
    const a = document.activeElement;
    return !a || a === document.body || a === d.cmd || a === d.send;
  }
  function stopTurn() {
    try { Pipeline.abort(); } catch (e) { console.error(e); }
    if (d.turnStatusText && !d.turnStatus.hidden) setStatusText('Stopping…');
    return true;
  }
  /* A failed turn hands the line back: into the box if the player has not
     typed something new there meanwhile; otherwise the notice says what it
     was ("Your action: …") so nothing is lost. */
  function restoreAction(text) {
    const now = d.cmd.value;
    if (!now.trim() || now === text) {
      if (now !== text) { d.cmd.value = text; syncSendLabel(); autosize(); }
      return 'box';
    }
    const KEPT = KEPT_LINE;
    const said = `Your action: “${text}”`;
    const notes = $$('.f-notice', d.feed);
    const last = notes[notes.length - 1];
    const span = last ? $('.f-notice-text', last) || last : null;
    if (span && span.textContent.includes(KEPT)) span.textContent = span.textContent.replace(KEPT, said);
    else feed.notice(said);
    return 'notice';
  }
  /* fromButton: the Send / Wait button. Enter on an empty box does nothing:
     a Wait (a paid turn) only comes from the button. */
  async function send(fromButton) {
    const text = d.cmd.value;
    if (Storage.readOnly) { toast(READ_ONLY_NOTICE); return; }
    if (!text.trim()) {
      if (fromButton !== true || turnRunning()) return;
      if (!canAct({ say: true })) return;
      const pause = spendGate(''); // Wave 43: Stop at the spending pause runs nothing
      if (pause && !(await pause)) return;
      hideAc();
      lastSent = { pass: true };
      try { await Pipeline.pass(); } catch (e) { console.error(e); }
      syncSendLabel();
      if (!isMobile() && screen === 'game' && focusStillOnComposer()) d.cmd.focus({ preventScroll: true });
      return;
    }
    // A hand open (wave 14, QA #10): /cheat win typed is the Win (cheat) control; /cheat cards says the cards are dealt.
    if (turnRunning() && !canQueue() && handCommand(text)) return;
    if (turnRunning() && !canQueue()) { if (Pipeline.handOpen) nudge(handNudge(), handNudge); else nudge(); return; }
    // A third line while one waits: it stays in the box (the Pipeline keeps one), and the status line says so.
    if (lineWaiting()) { nudge(QUEUE_FULL); return; }
    if (!canAct({ say: true, queue: true })) return;
    // Wave 43: at the spending pause the player is asked first; Stop keeps the words in the box.
    const pause = spendGate(text);
    if (pause) {
      if (!(await pause)) { syncSendLabel(); return; }
      if (d.cmd.value !== text || turnRunning()) return; // changed meanwhile: the player sends it again
    }
    hideAc();
    d.cmd.value = '';
    autosize();
    syncAddressee();
    lastSent = { text, mode: composer.mode, to: composer.to };
    let res = null;
    try { res = await Pipeline.submit(text, { mode: composer.mode, to: composer.to }); } catch (e) { console.error(e); res = { restoreInput: true }; }
    if (res && res.queued) { status.queued = true; status.queuedText = text; renderStatus(); }
    if (res && res.restoreInput) { restoreAction(text); if (res.reason === 'busy' && lineWaiting()) nudge(QUEUE_FULL); }
    syncSendLabel();
    // A command that put the focus somewhere on purpose (/edit: the editor's name field) keeps it there.
    if (!isMobile() && screen === 'game' && !(res && res.keepFocus) && focusStillOnComposer()) d.cmd.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!d.ac.hidden && ac.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveAc(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveAc(-1); return; }
      if (e.key === 'Tab') { e.preventDefault(); completeAc(ac.index >= 0 ? ac.index : 0); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideAc(); return; }
      if (e.key === 'Enter' && !e.shiftKey && ac.index >= 0) { e.preventDefault(); completeAc(ac.index); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(false); }
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
    sizeAc();
  }
  /* The list's height: half the window (CSS); a phone on its side with the
     keyboard up, the story's whole strip above it (one line a command
     there), not half the window. Measured again whenever the window
     changes (the keyboard comes up or goes down with the list open:
     initViewport), not only on the next key. */
  function sizeAc() {
    if (!d.ac || d.ac.hidden) return;
    d.ac.style.maxHeight = '';
    if (compactComposer()) {
      const room = Math.floor(d.ac.getBoundingClientRect().bottom - Math.max(0, d.app.getBoundingClientRect().top) - 4);
      if (room > d.ac.clientHeight) d.ac.style.maxHeight = Math.min(320, room) + 'px';
    }
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
    syncSendLabel();
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
  /* The composer's place for the focus: the box on a laptop, Send on a
     phone (no keyboard pops up) when what had it goes. opts.stay (Do / Say,
     a Say chip): on a phone the focus stays on the control pressed while it
     is still there. */
  function focusComposer(opts) {
    if (screen !== 'game') return;
    const a = document.activeElement;
    if (opts && opts.stay && isMobile() && a && a !== document.body && focusableNow(a)) return;
    const to = [isMobile() ? d.send : d.cmd, d.send, d.cmd].find(focusableNow);
    if (to) moveFocus(to);
  }
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
  /* More people here than this, on a phone: a "To: …" picker instead of the chips. */
  const SAY_PICK_OVER = 4;
  /* The toggle, the chips (Say mode only: Everyone plus each person here,
     exactly one pressed; on a phone one row that scrolls sideways, or, when
     the place is busy, one "To: Everyone ▾" picker as wide as its longest
     name instead) and the placeholder. Runs on every render, so the chips
     follow the scene: after each turn, a move, a load. */
  function renderComposer() {
    if (!d.cmd) return;
    const present = syncAddressee();
    const say = composer.mode === 'say';
    const phone = isMobile();
    // On its side with the keyboard up the Say row is the picker alone, in the input row; a picker with the focus stays one until it is left.
    const pickHasFocus = !!document.activeElement && document.activeElement.id === 'say-pick' && composer.rendered.startsWith('pick|');
    const many = phone && (present.length > SAY_PICK_OVER || compactComposer() || pickHasFocus);
    d.modeDo.setAttribute('aria-pressed', String(!say));
    d.modeSay.setAttribute('aria-pressed', String(say));
    d.sayTo.hidden = !say;
    const key = say ? (many ? 'pick|' : '') + ['everyone'].concat(present.map(n => n.id + ':' + npcLabel(n))).join('|') + '>' + composer.to : '';
    if (key !== composer.rendered) {
      composer.rendered = key;
      const chip = (id, label) => el('button', { type: 'button', class: 'say-chip', 'aria-pressed': String(composer.to === id), dataset: { to: id }, title: label }, label);
      let pick = null;
      if (say && many) {
        pick = el('select', { class: 'input say-pick', id: 'say-pick', 'aria-label': 'Say it to' },
          el('option', { value: 'everyone' }, 'To: Everyone'), present.map(n => el('option', { value: n.id }, `To: ${npcLabel(n)}`)));
        pick.value = composer.to;
      }
      // The focus stays on the picker or the chip it was on (never dropped to the page).
      const had = d.sayTo.contains(document.activeElement) ? document.activeElement : null;
      d.sayTo.replaceChildren(...(!say ? [] : pick ? [pick] : [chip('everyone', 'Everyone')].concat(present.map(n => chip(n.id, npcLabel(n))))));
      if (had) {
        const again = pick || $(`.say-chip[data-to="${CSS.escape(had.dataset.to || composer.to)}"]`, d.sayTo) || $('.say-chip[aria-pressed="true"]', d.sayTo);
        if (again) again.focus({ preventScroll: true }); else d.modeSay.focus({ preventScroll: true });
      }
      // The pressed chip stays in view in the sideways row.
      const on = phone && say ? $('.say-chip[aria-pressed="true"]', d.sayTo) : null;
      if (on && d.sayTo.scrollWidth > d.sayTo.clientWidth) d.sayTo.scrollLeft = Math.max(0, on.offsetLeft - d.sayTo.offsetLeft - (pick ? pick.offsetWidth + 6 : 0) - 8);
    }
    const who = addresseeName(present);
    // A phone's box is narrow: a short placeholder that never wraps (the ⋯ in the tab row and the tip say how to reach commands).
    d.cmd.placeholder = say ? (phone ? 'What do you say?' : `What do you say to ${who}?`) : (phone ? 'What do you do?' : 'What do you do? (/ or ⋯ for commands)');
    d.cmd.setAttribute('aria-label', say ? `What you say to ${who}` : 'Your action');
    placeSayTo();
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
  /* "This session: 23 turns · $0.61". */
  function sessionLine() {
    const u = Api.usage && Api.usage.session;
    // Wave 41: a model with no price is named: "$0.12 (no price known for claude-mystery-9: cost not counted)".
    const cost = u ? (u.priced ? `$${u.cost.toFixed(2)}` : `$${u.cost.toFixed(2)} (${(Api.priceNote && Api.priceNote(u)) || 'a model with no price: cost not counted'})`) : '$0.00';
    return `This session: ${sessionTurns} ${sessionTurns === 1 ? 'turn' : 'turns'} · ${cost}`;
  }
  function renderPreset() {
    const p = Storage.presetOf();
    $$('input[name="set-preset"]').forEach(r => { r.checked = r.value === p; });
    d.presetCustom.hidden = p !== 'custom';
    return p;
  }
  function fillModels() {
    const s = Storage.settings();
    d.setNarratorModel.value = s.narratorModel;
    d.setParserModel.value = s.parserModel;
    $$('[data-effort]').forEach(sel => { sel.value = s.effort[sel.dataset.effort]; });
  }
  function fillSettings() {
    const s = Storage.settings();
    d.setKey.value = Storage.getApiKey();
    d.setRemember.checked = s.rememberKey;
    d.setMock.checked = s.mockMode;
    d.setBuild.textContent = State.buildLine() + '. Name it in a bug report.'; // Wave 46
    d.setKeepPackets.checked = s.keepPackets === true;
    d.setRereadMemories.checked = s.rereadMemories === true;
    fillModels();
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
    d.sessionLine.textContent = sessionLine();
    document.getElementById('set-forget-status').textContent = ''; // Wave 44
    renderSpending();
    keyStatus('', null);
    if (renderPreset() === 'custom') d.setAdvanced.open = true;
  }
  function gameLoaded() { return App.inGame() && !!State.current && !State.muted; }
  function keyStatus(text, ok) {
    d.keyStatus.textContent = text;
    if (ok === true || ok === false) d.keyStatus.dataset.ok = ok ? '1' : '0'; else delete d.keyStatus.dataset.ok;
  }
  /* A key copied with a space or an invisible character in it fails in a way that reads like a network error. */
  const KEY_CHARS = /^[\x21-\x7e]+$/;
  function onSettingsChange(e) {
    const t = e.target;
    if (t === d.setKey || t === d.setRemember) {
      const had = !!Storage.getApiKey();
      Storage.setApiKey(d.setKey.value, d.setRemember.checked);
      const key = Storage.getApiKey();
      if (key && !KEY_CHARS.test(key)) keyStatus('That key has a space or a hidden character in it. Copy it again from the console.', false);
      else if (t === d.setKey) keyStatus('', null);
      // A key typed in means the player wants Claude: the demo goes off.
      if (!had && key && Storage.settings().mockMode) {
        Storage.saveSettings({ mockMode: false, playChoice: 'claude' });
        d.setMock.checked = false;
        toast(MOCK_OFF);
      }
      return;
    }
    if (t.name === 'set-theme') { Storage.saveSettings({ theme: t.value }); applyDisplay(); return; }
    if (t.name === 'set-size') { Storage.saveSettings({ textSize: t.value }); applyDisplay(); return; }
    if (t.name === 'set-style') { Storage.saveSettings({ narrationStyle: t.value }); return; }
    // Wave 43: the spending ceiling (a custom amount is kept once one is typed).
    if (t.name === 'set-ceiling') {
      if (t.value === 'custom') {
        d.ceilingCustom.hidden = false;
        const v = parseFloat(d.setCeilingAmount.value);
        if (Number.isFinite(v) && v >= 0.01) Storage.saveSettings({ spendCeiling: v });
        return;
      }
      Storage.saveSettings({ spendCeiling: t.value === 'off' ? null : Number(t.value) });
      renderSpending();
      return;
    }
    if (t === d.setCeilingAmount) {
      const v = parseFloat(t.value);
      Storage.saveSettings({ spendCeiling: Number.isFinite(v) && v >= 0.01 ? v : null });
      if (!(Number.isFinite(v) && v >= 0.01)) renderSpending();
      return;
    }
    if (t.name === 'set-preset') { Storage.applyPreset(t.value); fillModels(); renderPreset(); return; }
    const before = Storage.settings();
    const effort = {};
    $$('[data-effort]').forEach(sel => { effort[sel.dataset.effort] = sel.value; });
    const after = Storage.saveSettings({
      mockMode: d.setMock.checked,
      keepPackets: d.setKeepPackets.checked,
      rereadMemories: d.setRereadMemories.checked,
      narratorModel: d.setNarratorModel.value.trim() || Storage.DEFAULTS.narratorModel,
      parserModel: d.setParserModel.value.trim() || Storage.DEFAULTS.parserModel,
      effort,
      showRolls: d.setRolls.checked,
      permadeath: d.setPermadeath.checked
    });
    if (t === d.setMock && after.mockMode !== before.mockMode) Storage.saveSettings({ playChoice: after.mockMode ? 'demo' : 'claude' });
    renderPreset();
    if (before.showRolls !== after.showRolls && State.current && !State.muted) rebuildFeed();
  }
  /* "Check key": one small call through Api.checkKey. */
  async function checkKey() {
    const key = d.setKey.value.trim();
    if (!key) { keyStatus('Paste a key first.', false); return { ok: false, reason: 'empty' }; }
    if (key !== Storage.getApiKey()) Storage.setApiKey(key, d.setRemember.checked);
    if (!KEY_CHARS.test(key)) { keyStatus('That key has a space or a hidden character in it. Copy it again from the console.', false); return { ok: false, reason: 'characters' }; }
    keyStatus('Checking…', null);
    d.setCheckKey.disabled = true;
    let r = null;
    try { r = await Api.checkKey(key); } catch (e) { r = { ok: false, message: (e && e.message) || String(e) }; }
    d.setCheckKey.disabled = false;
    const ok = r === true || (isObj(r) && r.ok === true);
    // The reason as the API gives it, without sending the player to Settings: they are there.
    const why = (isObj(r) ? String(r.message || r.reason || '') : '').replace(/\s*(?:Check|Paste) (?:the|your|it) (?:key|again)[^.]*\bin Settings\./gi, '').replace(/\s*Add yours in Settings[^.]*\./gi, '').trim();
    // "That key did not work: the API did not accept it." (the reason in the sentence, not a second capital).
    const said = /^The API key was not accepted\b/i.test(why) ? 'the API did not accept it' : lowerFirst(why.replace(/\.$/, ''));
    keyStatus(ok ? 'The key works.' : `That key did not work${said ? ': ' + said : ''}.`, ok);
    return isObj(r) ? r : { ok };
  }

  /* Wave 44: Settings, "This device". Forget key: the key out of both
     storages and both fields, and New game asks how to play again; the
     saves and the other settings stay, and the line under it says so. */
  function forgetDeviceKey() {
    Storage.forgetKey();
    d.setKey.value = '';
    d.setRemember.checked = false;
    d.modeKeyInput.value = '';
    d.modeRemember.checked = false;
    keyStatus('', null);
    document.getElementById('set-forget-status').textContent = 'Key forgotten. Your games and settings are kept.';
    renderTitleMode();
    renderDemoBar();
    return true;
  }
  /* Delete all game data on this device: the button, then a question that
     names what goes (Keep it has the focus); yes clears every store the
     game keeps (Storage.wipeAll) and the page loads again as a fresh
     profile, on the title screen. Resolves false when kept. */
  async function deleteDeviceData() {
    const yes = await ask({
      title: 'Delete all game data on this device?',
      text: 'This deletes from this browser: the autosave and the previous autosave, the three save slots, the undo history, your settings and the API key. A game you are playing goes with them. Files you exported are not touched. This cannot be undone.',
      yes: 'Delete everything',
      no: 'Keep it'
    });
    if (!yes) return false;
    const r = await Storage.wipeAll();
    try { window.location.reload(); } catch (e) { /* the storage is clear either way */ }
    return r;
  }

  // ----- saves screen -----
  function slotMeta(env) {
    const s = env.summary || {};
    const when = env.savedAt ? new Date(env.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return `${s.player || '?'} · Day ${s.day}${s.phase ? ' · ' + capFirst(s.phase) : ''} · ${s.location || ''}${when ? ' · ' + when : ''}`;
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
  /* "Last exported: 3 days ago" (or never), so a game is not only in this browser. */
  function renderLastExport() {
    const at = Storage.settings().lastExportAt;
    let text = 'Last exported: never.';
    if (at) {
      const days = Math.floor((Date.now() - Date.parse(at)) / 86400000);
      text = `Last exported: ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}.`;
    }
    d.lastExport.textContent = text;
  }
  function renderSaves() {
    const inGame = App.inGame() && State.current && !State.muted;
    d.savesError.textContent = '';
    d.saveNameField.hidden = !inGame;
    if (inGame && !d.saveName.value) d.saveName.value = `${State.current.player.name}, Day ${State.current.time.day}`;
    d.btnExport.disabled = !inGame;
    d.btnImport.disabled = busy;
    renderLastExport();
    const loadBtn = (filled, onclick) => el('button', { type: 'button', class: 'btn small', 'data-action': 'load', dataset: { filled: filled ? '1' : '' }, disabled: busy || !filled, onclick }, 'Load');
    const updateBtn = (env, onclick) => (saveBehind(env) ? el('button', { type: 'button', class: 'btn small', 'data-action': 'update', disabled: busy, onclick, title: 'Load this game and update it to the latest rules' }, 'Update') : null);
    const rows = [];
    const auto = Storage.peek(Storage.KEYS.autosave);
    rows.push(slotRow('Autosave', auto, [loadBtn(!!auto && !auto.broken, () => App.continueGame()), updateBtn(auto, () => App.updateSave('autosave'))], 'slot-auto'));
    // The game the autosave held before a different one took its place.
    const prev = Storage.loadPrevious();
    if (prev) rows.push(slotRow('Previous autosave', prev, [el('button', { type: 'button', class: 'btn small', 'data-action': 'restore', dataset: { filled: '1' }, disabled: busy, onclick: () => App.restorePrevious() }, 'Restore previous')], 'slot-prev'));
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
    // A slot's button that had the focus keeps it through the redraw (Save here becomes Overwrite); one that is gone
    // (Delete on an emptied slot) gives it to the first button in its row, else the screen's heading.
    const had = d.slotList.contains(document.activeElement) ? document.activeElement : null;
    const at = had ? [had.closest('.slot') && had.closest('.slot').id, had.dataset.action] : null;
    d.slotList.replaceChildren(...rows);
    if (at && at[0]) {
      const row = document.getElementById(at[0]);
      const to = row ? [$(`[data-action="${at[1]}"]`, row)].concat($$('button', row)).find(focusableNow) : null;
      (to || d.savesTitle).focus({ preventScroll: true });
    }
  }
  async function onImport() {
    const file = d.importFile.files && d.importFile.files[0];
    d.importFile.value = '';
    if (!file) return;
    try {
      const env = await Storage.importFile(file);
      if (await App.enter(env)) toast('Imported.');
    } catch (e) {
      d.savesError.textContent = e.message;
    }
  }

  // ----- character creation -----
  /* One page on laptop, one step per screen on mobile (CSS shows only
     .step.current below 900px; the Next/Back buttons drive it). Before the
     form, on a first launch with no key, the mode view asks how to play
     (Claude with a key, or the offline demo). */
  const Create = (() => {
    const STEPS = [
      { id: 'name', title: 'Name', sub: 'What people in town will call you.' },
      { id: 'background', title: 'Background and age', sub: 'Sets your starting stats, money, three things (one a prepaid phone), and whether you arrive by road or river. Your age starts at what the background suggests.' },
      { id: 'stats', title: 'Stats', sub: 'You can move one point: take it from one stat with −, give it to another with +. Stats run from −1 to +3.' },
      { id: 'goal', title: 'Goal and flaw', sub: 'Why you came to this town, in one line, and the habit that gets you into trouble.' },
      { id: 'loose', title: 'Three loose ends', sub: 'Pick three. Each becomes a real person in town, with consequences.' }
    ];
    /* What each stat is for, in a line. */
    const STAT_LINES = {
      might: 'Strength and toughness: fights, lifting, holding a door shut.',
      wits: 'Noticing, figuring out, remembering, fixing things.',
      charm: 'Talking people round: persuading, lying, calming, flirting.',
      stealth: 'Not being seen: sneaking, picking pockets and locks, slipping off.'
    };
    const GOAL_FALLBACK = ['Find out what happened to my brother'];
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
    /* What the tiles show: a point taken but not yet given shows as taken. */
    function shownStats() {
      const b = bg();
      if (!b) return null;
      const s = finalStats();
      if (draft.moveFrom && !draft.moveTo) s[draft.moveFrom] -= 1;
      else if (draft.moveTo && !draft.moveFrom) s[draft.moveTo] += 1;
      return s;
    }
    function flawText() { return cleanText(draft.flawCustom, 120) || (draft.flawIndex >= 0 ? FLAWS[draft.flawIndex] : ''); }
    function chosenLoose() {
      return LOOSE_END_KINDS.filter(k => draft.loose[k] && draft.loose[k].on).map(k => ({ kind: k, text: cleanText(draft.loose[k].text, 200) }));
    }
    /* The goal suggestions: the town's (Game.data.GOAL_PRESETS), as text. */
    function goalPresets() {
      let list = null;
      try { list = window.Game && window.Game.data && window.Game.data.GOAL_PRESETS; } catch (e) { list = null; }
      if (!Array.isArray(list)) { try { list = typeof GOAL_PRESETS !== 'undefined' ? GOAL_PRESETS : null; } catch (e) { list = null; } }
      const out = (Array.isArray(list) ? list : []).map(g => (typeof g === 'string' ? g : isObj(g) ? (g.text || g.label || '') : '')).map(g => cleanText(g, 140)).filter(Boolean);
      return out.length ? out : GOAL_FALLBACK;
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
    function focusSel(sel) { const n = $(sel, d.createSteps); if (n) n.focus({ preventScroll: true }); return !!n; }
    /* A number below n, from the browser's random source (the game's own dice stay seeded). */
    function rnd(n) {
      try { const a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Date.now() / 7) % n; }
    }
    const pick = list => list[rnd(list.length)];

    function wire() {
      d.crCancel.addEventListener('click', quit);
      d.crBack.addEventListener('click', backStep);
      d.crNext.addEventListener('click', nextStep);
      d.crReview.addEventListener('click', review);
      d.crRandom.addEventListener('click', () => randomiseAsk());
      // Back to edit: the form again, its heading taking the focus (never the page).
      d.crEdit.addEventListener('click', () => { App.cancelPrepare(); showForm(); focusScreen('create'); });
      d.crBegin.addEventListener('click', () => App.begin());
      // How to play
      d.chooseDemo.addEventListener('click', () => {
        Storage.saveSettings({ mockMode: true, playChoice: 'demo' });
        start();
        focusScreen('create');
      });
      d.chooseClaude.addEventListener('click', () => {
        const open = d.modeKey.hidden;
        d.modeKey.hidden = !open;
        d.chooseClaude.setAttribute('aria-expanded', String(open));
        d.chooseClaude.setAttribute('aria-pressed', String(open));
        if (open) d.modeKeyInput.focus();
      });
      d.modeKeyGo.addEventListener('click', useKey);
      d.modeKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); useKey(); } });
      d.modeCancel.addEventListener('click', () => showScreen('title'));
    }
    /* "Play with Claude": the key goes in, the demo goes off, then the form. */
    function useKey() {
      const key = d.modeKeyInput.value.trim();
      if (!key) { d.modeKeyErr.textContent = 'Paste your API key, or pick the offline demo.'; d.modeKeyInput.focus(); return false; }
      if (!/^[\x21-\x7e]+$/.test(key)) { d.modeKeyErr.textContent = 'That key has a space or a hidden character in it. Copy it again from the console.'; return false; }
      d.modeKeyErr.textContent = '';
      Storage.setApiKey(key, d.modeRemember.checked);
      const wasDemo = Storage.settings().mockMode;
      Storage.saveSettings({ mockMode: false, playChoice: 'claude' });
      if (wasDemo) toast(MOCK_OFF);
      d.modeKeyInput.value = '';
      start();
      focusScreen('create');
      return true;
    }
    /* First launch with no key and no choice yet: ask how to play. */
    function needsChoice() { return !Storage.getApiKey() && Storage.settings().playChoice !== 'demo'; }
    function showChoice() {
      d.createModeView.hidden = false;
      d.createFormView.hidden = true;
      d.createSummaryView.hidden = true;
      d.modeKey.hidden = true;
      d.modeKeyErr.textContent = '';
      d.chooseClaude.setAttribute('aria-expanded', 'false');
      d.chooseClaude.removeAttribute('aria-pressed');
      d.createScroll.scrollTop = 0;
    }
    function start() {
      draft = blank();
      step = 0;
      d.createModeView.hidden = true;
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
      d.createModeView.hidden = true;
      d.createSummaryView.hidden = true;
      d.createFormView.hidden = false;
      d.crErrsum.textContent = '';
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
      if (err) { const f = firstBadField(id); if (f) f.focus({ preventScroll: false }); return; }
      if (step < STEPS.length - 1) {
        step += 1;
        updateSteps();
        d.createScroll.scrollTop = 0;
        // The step's heading takes the focus: a screen reader hears where it is, and no keyboard covers the suggestions.
        focusStepHead(STEPS[step].id);
      } else review();
    }
    function backStep() {
      if (step > 0) { step -= 1; updateSteps(); d.createScroll.scrollTop = 0; focusStepHead(STEPS[step].id); } else quit();
    }
    function focusStepHead(id) { const h = document.getElementById('cr-h-' + id); if (h) h.focus({ preventScroll: true }); }
    /* The control to fix first on a step with an error. */
    function firstBadField(id) {
      const sec = sections[id];
      if (!sec) return null;
      switch (id) {
        case 'name': return $('#cr-name', sec);
        case 'background': return bg() ? $('#cr-age', sec) : $('.bg-choice', sec);
        case 'stats': return $('.step-btn:not([disabled])', sec);
        case 'goal': return !cleanText(draft.goal, 140) ? $('#cr-goal', sec) : $('.flaw-choice', sec);
        case 'loose': return $('.le-text:placeholder-shown', sec) || $$('.le-text', sec).find(x => !x.value.trim()) || $('.le-toggle:not([disabled])[aria-pressed="false"]', sec) || $('.le-toggle', sec);
        default: return null;
      }
    }
    function stepError(id) {
      switch (id) {
        case 'name': return cleanText(draft.name, 40) ? '' : 'Give your character a name.';
        case 'background': return bg() ? ageError() : 'Pick a background.';
        case 'stats': return (draft.moveFrom && !draft.moveTo) ? `You took a point from ${capFirst(draft.moveFrom)}: give it to another stat with +, or put it back.`
          : (draft.moveTo && !draft.moveFrom) ? `You gave a point to ${capFirst(draft.moveTo)}: take it from another stat with −, or take it back.` : '';
        case 'goal':
          if (!cleanText(draft.goal, 140)) return 'Write one line about why you came here, or tap one of the suggestions.';
          return flawText() ? '' : 'Pick a flaw or write your own.';
        case 'loose': {
          const ch = chosenLoose();
          if (ch.length !== 3) return `Choose exactly three loose ends (${ch.length} chosen).`;
          if (ch.some(x => !x.text)) return 'Each loose end needs a line of text.';
          return '';
        }
        default: return '';
      }
    }
    /* A step's own message (plain text by its fields), and the one summary
       that is read out (#cr-errsum, role=alert): on a laptop it sits beside
       Review and lists the steps to fix; on a phone it is the step's message,
       for screen readers only. */
    function showErr(id, msg) {
      const e = $('.err', sections[id]);
      if (e) e.textContent = msg || '';
      if (msg) {
        d.crErrsum.textContent = msg;
        const f = firstBadField(id);
        if (f) { f.setAttribute('aria-invalid', 'true'); f.setAttribute('aria-describedby', e ? e.id : ''); }
      } else {
        for (const x of $$('[aria-invalid="true"]', sections[id])) x.removeAttribute('aria-invalid');
        if (d.crErrsum.textContent && !STEPS.some(st => $('.err', sections[st.id]) && $('.err', sections[st.id]).textContent)) d.crErrsum.textContent = '';
      }
    }
    function review() {
      const bad = [];
      STEPS.forEach((st, i) => { const err = stepError(st.id); showErr(st.id, err); if (err) bad.push(i); });
      if (bad.length) {
        const firstBad = bad[0];
        step = firstBad;
        updateSteps();
        // One message, not one per step: what to fix, then the focus on the first thing to fix.
        d.crErrsum.textContent = bad.length === 1 ? `Fix this first: ${$('.err', sections[STEPS[firstBad].id]).textContent}` : `Fix ${bad.length} things first: ${bad.map(i => lowerFirst(STEPS[i].title)).join('; ')}.`;
        sections[STEPS[firstBad].id].scrollIntoView({ block: 'start' });
        const f = firstBadField(STEPS[firstBad].id);
        if (f) f.focus({ preventScroll: true }); else focusStepHead(STEPS[firstBad].id);
        return false;
      }
      d.crErrsum.textContent = '';
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
    /* Random character over a form already started asks first (Keep mine is the default). */
    async function randomiseAsk() {
      if (draft && JSON.stringify(draft) !== JSON.stringify(blank())) {
        const yes = await ask({ title: 'Replace what you have chosen?', text: 'Random character fills in every step, over what you have typed or picked so far.', yes: 'Replace it', no: 'Keep mine' });
        if (!yes) return false;
      }
      return randomise();
    }
    /* "Random character": every step filled in at once, all of it editable,
     then straight to the summary. Names that belong to someone in town are
     never picked. */
    /* Family names for a random player (never a person in town: the cast is
       written by hand, and names anyone in it has are left out below). */
    const PLAYER_SURNAMES = ['Hale', 'Mercer', 'Tate', 'Boone', 'Rourke', 'Sutter', 'Kimbrough', 'Ledford', 'Danner', 'Holloway', 'Calloway', 'Whitlock', 'Ashby', 'Toomey', 'Varga', 'Delacroix', 'Okafor', 'Reyes', 'Lindqvist', 'Barlowe'];
    function randomise() {
      const taken = new Set();
      for (const n of (TOWN_DATA.npcs || [])) for (const w of String(n.name || '').split(/\s+/)) taken.add(w.toLowerCase());
      const T = TABLES.npc || {};
      const firsts = (T.firstNames || ['Sam']).filter(x => !taken.has(x.toLowerCase()));
      const lasts = PLAYER_SURNAMES.filter(x => !taken.has(x.toLowerCase()));
      const fresh = blank();
      fresh.name = `${pick(firsts.length ? firsts : ['Sam'])} ${pick(lasts.length ? lasts : ['Stranger'])}`;
      const b = pick(BACKGROUNDS);
      fresh.backgroundId = b.id;
      fresh.age = Number.isInteger(b.age) ? String(b.age) : '';
      const from = STATS.filter(k => b.stats[k] > -1);
      const to = STATS.filter(k => b.stats[k] < 3);
      if (rnd(2) && from.length && to.length) {
        fresh.moveFrom = pick(from);
        const rest = to.filter(k => k !== fresh.moveFrom);
        fresh.moveTo = rest.length ? pick(rest) : '';
        if (!fresh.moveTo) fresh.moveFrom = '';
      }
      fresh.goal = pick(goalPresets());
      fresh.flawIndex = rnd(FLAWS.length);
      const kinds = LOOSE_END_KINDS.filter(k => fresh.loose[k]).slice();
      for (let i = 0; i < 3 && kinds.length; i++) {
        const k = kinds.splice(rnd(kinds.length), 1)[0];
        const opts = LOOSE_ENDS[k].options;
        const o = rnd(opts.length);
        fresh.loose[k] = { on: true, option: o, text: opts[o] };
      }
      draft = fresh;
      for (const st of STEPS) renderStep(st.id);
      return review();
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
      return [el('h2', { class: 'step-title', id: 'cr-h-' + st.id, tabindex: '-1' }, st.title), el('p', { class: 'step-sub' }, st.sub)];
    }
    function renderStep(id) {
      const st = STEPS.find(x => x.id === id);
      const sec = sections[id];
      if (!sec) return;
      const body = BODIES[id]();
      sec.replaceChildren(...stepHead(st), ...[].concat(body), el('p', { class: 'err', id: 'cr-err-' + id }));
    }
    /* A loose end's suggestion as a chip: its first words (the whole line goes in the field when picked). */
    function chipWords(t) {
      const words = String(t || '').split(/\s+/).filter(Boolean);
      return words.length > 5 ? `${words.slice(0, 4).join(' ').replace(/[,;:.]$/, '')}…` : words.join(' ');
    }
    /* Suggestion chips that fill a text field (a goal, a loose end's line).
       short: the chip shows the first words, the field the whole line (and
       the chip's accessible name and tooltip are the whole line). */
    function suggestions(label, list, current, onPick, cls, short) {
      return el('div', { class: 'cr-suggest' }, el('span', { class: 'cr-suggest-k' }, label),
        el('div', { class: 'chips', role: 'group', 'aria-label': label }, list.map((t, i) => el('button', {
          type: 'button', class: 'chip ' + (cls || ''), 'aria-pressed': String(cleanText(current, 200) === cleanText(t, 200)), dataset: { index: String(i), full: t },
          title: short ? t : null, 'aria-label': short && chipWords(t) !== t ? t : null,
          onclick: () => onPick(t, i)
        }, short ? chipWords(t) : t))));
    }
    /* − / + on a stat: one point moves, the total stays the same. */
    function stepStat(k, dir) {
      const b = bg();
      if (!b) return;
      if (dir < 0) {
        if (draft.moveTo === k) draft.moveTo = '';
        else if (b.stats[k] > -1 && draft.moveFrom !== k) draft.moveFrom = k;
      } else {
        if (draft.moveFrom === k) draft.moveFrom = '';
        else if (b.stats[k] < 3 && draft.moveTo !== k) draft.moveTo = k;
      }
      renderStep('stats');
      focusSel(`.step-btn[data-for="${k}"][data-dir="${dir < 0 ? 'down' : 'up'}"]:not([disabled])`) || focusSel(`.step-btn[data-for="${k}"]:not([disabled])`);
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
        const shown = shownStats();
        const pending = draft.moveFrom && !draft.moveTo ? `One point taken from ${capFirst(draft.moveFrom)}. Press + on the stat that should get it.`
          : draft.moveTo && !draft.moveFrom ? `One point for ${capFirst(draft.moveTo)}: press − on the stat to take it from.`
            : draft.moveFrom && draft.moveTo ? `Moved a point from ${capFirst(draft.moveFrom)} to ${capFirst(draft.moveTo)}.` : '';
        const tiles = STATS.map(k => {
          const downOk = draft.moveTo === k || (b.stats[k] > -1 && draft.moveFrom !== k && !(draft.moveFrom && draft.moveTo));
          const upOk = draft.moveFrom === k || (b.stats[k] < 3 && draft.moveTo !== k && !(draft.moveFrom && draft.moveTo));
          return el('div', { class: 'cr-stat' + (shown[k] !== b.stats[k] ? ' changed' : ''), dataset: { statTile: k } },
            el('button', { type: 'button', class: 'step-btn', dataset: { for: k, dir: 'down' }, 'aria-label': `One point less ${k}`, disabled: !downOk, onclick: () => stepStat(k, -1) }, '−'),
            el('span', { class: 'cr-stat-mid' }, el('span', { class: 'stat-name' }, capFirst(k)), el('span', { class: 'stat-val', dataset: { stat: k } }, fmtMod(shown[k]))),
            el('button', { type: 'button', class: 'step-btn', dataset: { for: k, dir: 'up' }, 'aria-label': `One point more ${k}`, disabled: !upOk, onclick: () => stepStat(k, 1) }, '+'),
            el('p', { class: 'cr-stat-desc' }, STAT_LINES[k] || ''));
        });
        return [el('div', { class: 'cr-stats', id: 'cr-stat-grid', role: 'group', 'aria-label': 'Stats' }, tiles),
          el('p', { class: 'cr-pending', role: 'status' }, pending),
          el('p', { class: 'hint' }, 'Optional. A roll adds the stat to a d20. Your background already set these.')];
      },
      goal() {
        const presets = goalPresets();
        const goal = el('input', { class: 'input', id: 'cr-goal', type: 'text', maxlength: '140', autocomplete: 'off', placeholder: 'Why you came, in a line', value: draft.goal,
          'aria-label': 'Your goal',
          oninput: e => { draft.goal = e.target.value; showErr('goal', ''); syncPressed('.goal-choice', draft.goal); },
          onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); if (isMobile()) nextStep(); } } });
        const flaws = el('div', { class: 'chips', role: 'group', 'aria-label': 'Flaws' }, FLAWS.map((f, i) => el('button', {
          type: 'button', class: 'chip flaw-choice', 'aria-pressed': String(draft.flawIndex === i && !cleanText(draft.flawCustom)), dataset: { index: String(i) },
          onclick: () => { draft.flawIndex = i; draft.flawCustom = ''; renderStep('goal'); focusSel(`.flaw-choice[data-index="${i}"]`); }
        }, f)));
        const custom = el('input', { class: 'input', id: 'cr-flaw-custom', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'Or write your own flaw', value: draft.flawCustom,
          'aria-label': 'Your own flaw',
          oninput: e => {
            draft.flawCustom = e.target.value;
            if (cleanText(draft.flawCustom)) draft.flawIndex = -1;
            $$('.flaw-choice', sections.goal).forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.index === draft.flawIndex && !cleanText(draft.flawCustom))));
            showErr('goal', '');
          } });
        return [
          el('label', { class: 'label', for: 'cr-goal' }, 'Goal'), goal,
          suggestions('Or pick one:', presets, draft.goal, t => { draft.goal = t; goal.value = t; showErr('goal', ''); syncPressed('.goal-choice', t); goal.focus({ preventScroll: true }); }, 'goal-choice'),
          el('span', { class: 'label', style: 'margin-top:22px' }, 'Flaw'), flaws, el('div', { style: 'margin-top:12px' }, custom)];
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
            // One line, yours to edit; the suggestions fill it.
            const txt = el('input', { class: 'input le-text', type: 'text', maxlength: '200', autocomplete: 'off', value: st.text, dataset: { kind: k },
              'aria-label': `${def.label}, in your words`, oninput: e => { st.text = e.target.value; syncPressed(`.le-choice[data-kind="${k}"]`, st.text); } });
            const chips = suggestions('Suggestions:', def.options, st.text, (t, i) => { st.option = i; st.text = t; txt.value = t; syncPressed(`.le-choice[data-kind="${k}"]`, t); }, 'le-choice', true);
            for (const c of $$('.le-choice', chips)) c.dataset.kind = k;
            inner = el('div', { class: 'le-body' }, txt, chips);
          }
          return el('div', { class: 'le-item' + (st.on ? ' on' : ''), dataset: { kind: k } }, toggle, inner);
        });
        return [el('p', { class: 'step-count', id: 'cr-le-count' }, `${chosen.length} of 3 chosen.`), el('div', { style: 'margin-top:10px' }, items)];
      }
    };
    function syncPressed(sel, text) {
      const want = cleanText(text, 200);
      for (const c of $$(sel, d.createSteps)) c.setAttribute('aria-pressed', String(cleanText(c.dataset.full || c.textContent, 200) === want));
    }
    return { wire, start, review, layoutChanged, randomise, randomiseAsk, needsChoice, showChoice, get draft() { return draft; }, STEPS };
  })();

  return {
    init, showScreen, back, renderGame, renderPanel, rebuildFeed, openPanel, closeSheet, setCollapsed, toggleDebug,
    toggleTheme, applyDisplay, warn, toast, ask, setBusy, feed, Create, scrollToBottom, showCash,
    setMode, setAddressee, renderComposer, togglePerson, togglePlace, renderMap, mapLayout, setMapExpanded, showPerson,
    editPerson: editPersonFromCommand, saveEdit, cancelEdit,
    openActions, closeActions, showTip, takeNotes, otherTab, continueLine, renderTitle, markUndo, sessionLine, restoreAction,
    // Wave 43: the cost chip, Settings at Spending, the game's cost lines and the projection, the spending pause.
    renderCost, openSpending, spendLine, paceLine, spendProjection, spendNotice, spendGate, PACE_DAY,
    MOCK_OFF, READ_ONLY_NOTICE, pendingNotes, showRecap, canAct, runAction, travel: confirmTravel, cancelQueued,
    placeTypeLabel, placeLabel, placeUndo, expandedSize, effectText, compactComposer, runOn,
    // Wave 30: where someone stands, in words (the People card's chip and its standing block).
    stanceChip, personStanding,
    get status() { return { stage: status.stage, queued: status.queued, text: d.turnStatus && !d.turnStatus.hidden ? d.turnStatusText.textContent : '' }; },
    get mapExpanded() { return mapExpanded; },
    get peopleQuery() { return peopleQuery; },
    get openPerson() { return openPerson; },
    get openPlace() { return openPlace; },
    get editing() { return editing ? editing.id : null; },
    get mapPick() { return mapPick; },
    get mode() { return composer.mode; },
    get addressee() { syncAddressee(); return composer.to; },
    get screen() { return screen; },
    get tab() { return tab; },
    get debug() { return debugOn; },
    get stuckToBottom() { return stick; }
  };
})();

