'use strict';
/* Wave 45 (accessibility, from a headless audit of the page): the game
   screen's story and input are a labelled <main> beside the labelled nav
   and aside, with a "Skip to the story" link as the first stop of Tab; one
   h1 per screen; every button, field and select has a name; no positive
   tabindex; text holds 4.5:1 (3:1 at 24px and up) in both themes; font
   sizes are in rem, so a larger browser default (and Text size Large)
   scales the interface and the story; each narration carries a heading
   only screen readers meet ("Turn N"), the feed staying a log; the status
   line has a polite live region that is always on the page; reduced
   motion stops the feed's and the sheet's transitions; and the focus is
   not dropped by the sheet, Settings or a feed drawn again. Mock mode.
   Run with: node tests/run.cjs wave45 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, findScene, place, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('wave45-a11y');

/* In the page: the accessible name of a control, from aria-labelledby,
   aria-label, its <label>s, its text, else its title. */
function installName(page) {
  return page.evaluate(() => {
    window.__name = el => {
      const by = el.getAttribute('aria-labelledby');
      if (by) { const t = by.split(/\s+/).map(id => { const x = document.getElementById(id); return x ? x.textContent : ''; }).join(' ').trim(); if (t) return t; }
      const al = (el.getAttribute('aria-label') || '').trim();
      if (al) return al;
      if (el.labels && el.labels.length) { const t = [...el.labels].map(l => l.textContent).join(' ').trim(); if (t) return t; }
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SUMMARY') { const t = (el.textContent || '').trim(); if (t) return t; }
      if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) return el.value;
      return (el.getAttribute('title') || '').trim();
    };
    // On the page for a screen reader: drawn (a visually hidden node counts), not under hidden, not display:none.
    window.__exposed = el => el.getClientRects().length > 0 && !el.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(el).visibility !== 'hidden';
  });
}

/* Every exposed button, input, select and textarea without a name, and every positive tabindex. */
const unnamed = (page, label) => page.evaluate(label => {
  const bad = [...document.querySelectorAll('button, input, select, textarea, [role=button], [role=tab], [role=menuitem]')]
    .filter(el => window.__exposed(el) && !(el.type === 'hidden'))
    .filter(el => !window.__name(el))
    .map(el => `${label}: ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}`);
  const pos = [...document.querySelectorAll('[tabindex]')].filter(el => el.tabIndex > 0).map(el => `${label}: tabindex ${el.getAttribute('tabindex')} on ${el.id || el.className}`);
  return { bad, pos, checked: document.querySelectorAll('button, input, select, textarea').length };
}, label);

const h1s = page => page.evaluate(() => [...document.querySelectorAll('h1')].filter(h => window.__exposed(h)).map(h => h.textContent.trim()));

s.test('landmarks: a labelled main around the story and the input, the nav and the aside labelled, one h1 on each screen', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await installName(page);
  assert.deepEqual(await h1s(page), [await page.textContent('#title-name')], 'title: one h1');
  await page.click('#btn-settings');
  assert.deepEqual(await h1s(page), ['Settings'], 'settings: one h1');
  await page.click('#settings-done');
  await quickStart(page);
  assert.deepEqual(await h1s(page), ['The story'], 'game: one h1 (visually hidden)');
  const r = await page.evaluate(() => {
    const vis = [...document.querySelectorAll('main, [role=main]')].filter(m => window.__exposed(m));
    const m = vis[0];
    const named = sel => [...document.querySelectorAll(sel)].filter(x => window.__exposed(x)).map(x => window.__name(x));
    return {
      mains: vis.length, mainName: m ? window.__name(m) : null,
      feedIn: !!m && m.contains(document.getElementById('feed')), cmdIn: !!m && m.contains(document.getElementById('cmd')), sendIn: !!m && m.contains(document.getElementById('send')),
      panelOut: !!m && !m.contains(document.getElementById('panel')),
      navs: [...document.querySelectorAll('nav')].map(x => window.__name(x)), asides: named('aside'), log: document.getElementById('feed').getAttribute('role')
    };
  });
  assert.equal(r.mains, 1, 'one main');
  assert.equal(r.mainName, 'The story');
  assert.ok(r.feedIn && r.cmdIn && r.sendIn, 'the feed and the input are in main');
  assert.ok(r.panelOut, 'the side panel is its own landmark, outside main');
  assert.ok(r.navs.length >= 1 && r.navs.every(Boolean), 'every nav labelled: ' + JSON.stringify(r.navs));
  // The side panel, and the first turn's tip ("How to play"), each labelled.
  assert.ok(r.asides.includes('Side panel') && r.asides.every(Boolean), 'every aside labelled: ' + JSON.stringify(r.asides));
  assert.equal(r.log, 'log', 'the feed is still a log');
  // A phone: the tab bar is the nav on screen, inside main with the input; the sheet is the aside.
  const phone = await h.open({ viewport: PHONE });
  await installName(phone);
  await quickStart(phone);
  const p = await phone.evaluate(() => ({ nav: [...document.querySelectorAll('nav')].filter(x => window.__exposed(x)).map(x => window.__name(x)), main: [...document.querySelectorAll('main')].filter(x => window.__exposed(x)).length }));
  assert.deepEqual(p, { nav: ['Open a panel'], main: 1 });
});

s.test('every button, field and select has a name on every screen and in every panel, on a laptop and a phone; no positive tabindex', async h => {
  const problems = [];
  let checked = 0;
  const check = async (page, label) => { const r = await unnamed(page, label); problems.push(...r.bad, ...r.pos); checked += r.checked; };
  const page = await h.open({ viewport: LAPTOP });
  await installName(page);
  await check(page, 'title');
  await page.click('#btn-new');
  await check(page, 'create (how to play)');
  await page.click('#choose-claude');
  await check(page, 'create (key)');
  await page.click('#choose-demo');
  await page.waitForSelector('#create-form-view:not([hidden])');
  await check(page, 'create (form)');
  await page.click('#cr-random');
  await check(page, 'create (summary)');
  await page.click('#cr-edit').catch(() => {});
  await page.evaluate(() => Game.UI.showScreen('settings'));
  await page.evaluate(() => { document.getElementById('set-advanced').open = true; });
  await check(page, 'settings');
  await page.evaluate(() => Game.UI.showScreen('saves'));
  await check(page, 'saves');
  await quickStart(page);
  await sendText(page, 'look around');
  for (const t of ['character', 'people', 'journal', 'objectives', 'places']) { await page.evaluate(t => Game.UI.openPanel(t), t); await check(page, 'game, ' + t); }
  await page.click('#act-btn');
  await check(page, 'game, actions list');
  await page.keyboard.press('Escape');
  await page.click('#mode-say');
  await check(page, 'game, Say');
  // The Do / Say switch and the Say row are groups with a name.
  const groups = await page.evaluate(() => [document.querySelector('.mode-toggle'), document.getElementById('say-to')].map(g => [g.getAttribute('role'), window.__name(g)]));
  assert.deepEqual(groups, [['group', 'Do or say'], ['group', 'Say it to']]);

  const phone = await h.open({ viewport: PHONE });
  await installName(phone);
  await check(phone, 'phone title');
  await quickStart(phone);
  await check(phone, 'phone game');
  await phone.click('[data-open-tab="people"]');
  await phone.waitForSelector('#game-body.sheet-open');
  await check(phone, 'phone sheet');
  await phone.click('#panel-close');
  await phone.click('#tb-menu');
  await check(phone, 'phone menu');
  await phone.keyboard.press('Escape');
  // With more than four people here the Say row leads with a "To:" picker, which is named too.
  const crowd = await findScene(phone, { min: 5 });
  if (crowd) {
    await place(phone, crowd.loc.id, crowd.phase);
    await phone.evaluate(() => Game.UI.renderGame());
    await phone.click('#mode-say');
    const pick = await phone.evaluate(() => { const p = document.getElementById('say-pick'); return p ? [window.__name(p), p.closest('[role=group]') && window.__name(p.closest('[role=group]'))] : null; });
    if (pick) assert.deepEqual(pick, ['Say it to', 'Say it to'], 'the To: picker is named, in its group');
    await check(phone, 'phone Say with a crowd');
  }
  assert.deepEqual(problems, [], 'controls without a name, or a positive tabindex');
  assert.ok(checked > 200, 'controls checked: ' + checked);
});

s.test('the skip link is the first stop of Tab on the game screen, shows when focused and takes the focus to the box (or the story when the box is off)', async h => {
  const page = await h.open({ viewport: LAPTOP });
  assert.equal(await page.evaluate(() => document.getElementById('skip-link').hidden), true, 'not on the title screen');
  await quickStart(page);
  const order = await page.evaluate(() => {
    const focusable = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length && !el.closest('[hidden], [inert]') && getComputedStyle(el).visibility !== 'hidden');
    return focusable.slice(0, 3).map(el => el.id || el.className);
  });
  assert.equal(order[0], 'skip-link', 'first in tab order: ' + order.join(', '));
  assert.equal(await page.textContent('#skip-link'), 'Skip to the story');
  // From the top of the game screen (its heading), Shift+Tab reaches it; it is drawn while focused.
  await page.focus('#game-title');
  await page.keyboard.press('Shift+Tab');
  const shown = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { id: a.id, w: r.width, h: r.height, top: r.top, left: r.left }; });
  assert.equal(shown.id, 'skip-link');
  assert.ok(shown.h >= 44 && shown.w >= 44 && shown.top >= 0 && shown.left >= 0, 'drawn on screen when focused: ' + JSON.stringify(shown));
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'Enter takes the focus to the box');
  // Unfocused, it takes no room and is no tap target.
  assert.deepEqual(await page.evaluate(() => { const r = document.getElementById('skip-link').getBoundingClientRect(); return [r.width, r.height]; }), [0, 0]);
  // The box off: the story itself takes the focus.
  await page.evaluate(() => { document.getElementById('cmd').disabled = true; });
  await page.focus('#skip-link');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'feed', 'the story');
  await page.evaluate(() => { document.getElementById('cmd').disabled = false; document.getElementById('cmd').focus(); });
  assert.equal(await page.evaluate(() => document.getElementById('feed').hasAttribute('tabindex')), false, 'the story is no tab stop afterwards');
  // A phone: the same link first, to the box.
  const phone = await h.open({ viewport: PHONE });
  await quickStart(phone);
  await phone.focus('#game-title');
  await phone.keyboard.press('Shift+Tab');
  assert.equal(await phone.evaluate(() => document.activeElement.id), 'skip-link');
  await phone.keyboard.press('Enter');
  assert.equal(await phone.evaluate(() => document.activeElement.id), 'cmd');
});

/* In the page: the contrast of every visible text node's element against
   the background behind it (the colours composited, walking up). */
function contrastSample(root) {
  const parse = c => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0, 0]; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor);
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const faded = el => { for (let e = el; e; e = e.parentElement) if (parseFloat(getComputedStyle(e).opacity) < 1) return true; return false; };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.querySelector(root), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const e = n.parentElement;
    if (!e || seen.has(e) || e.closest('svg, [hidden], .visually-hidden, .skip-link, :disabled, [aria-disabled="true"], option')) continue;
    seen.add(e);
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || r.bottom < 0 || r.top > innerHeight || faded(e)) continue;
    const bg = bgOf(e);
    if (!bg) continue;
    const fg = over(parse(cs.color), bg);
    const a = lum(fg), b = lum(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(cs.fontSize);
    const big = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
    out.push({ what: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${e.className} "${n.textContent.trim().slice(0, 24)}"`, ratio: Math.round(ratio * 100) / 100, need: big ? 3 : 4.5 });
  }
  return out;
}

s.test('text contrast: at least 4.5:1 (3:1 at 24px and up) against what is behind it, in both themes, over 40 elements each', async h => {
  for (const scheme of ['dark', 'light']) {
    const page = await h.open({ viewport: LAPTOP, colorScheme: scheme });
    const rows = [];
    rows.push(...await page.evaluate(contrastSample, '#screen-title'));
    await page.click('#btn-settings');
    rows.push(...await page.evaluate(contrastSample, '#screen-settings'));
    await page.click('#settings-done');
    await quickStart(page);
    await sendText(page, 'look around');
    rows.push(...await page.evaluate(contrastSample, '#screen-game'));
    for (const t of ['people', 'journal']) { await page.evaluate(t => Game.UI.openPanel(t), t); rows.push(...await page.evaluate(contrastSample, '#panel')); }
    const theme = await page.getAttribute('html', 'data-theme');
    assert.equal(theme, scheme === 'dark' ? 'dark' : 'parchment');
    const bad = rows.filter(r => r.ratio < r.need).map(r => `${r.what} ${r.ratio}`);
    assert.ok(rows.length >= 40, `${theme}: ${rows.length} sampled`);
    assert.deepEqual(bad, [], `${theme}: under the line`);
    console.log(`        ${theme}: ${rows.length} text elements, lowest ${Math.min(...rows.map(r => r.ratio))}:1`);
  }
});

s.test('font sizes follow the root: a 20px root scales the interface and the story by 1.25; Text size Large scales the interface by an eighth, the story 20px; px pins hold at 16px', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const SEL = { body: 'body', send: '#send', time: '.tb-time', label: '.tb-loc', tab: '#tab-character', h3: '#panel-body h3', narr: '#feed .f-narr', cmd: '#cmd' };
  const sizes = () => page.evaluate(sel => Object.fromEntries(Object.entries(sel).map(([k, q]) => { const e = document.querySelector(q); return [k, e ? parseFloat(getComputedStyle(e).fontSize) : null]; })), SEL);
  const at16 = await sizes();
  assert.equal(at16.body, 15, 'the interface at 16px root as before');
  assert.equal(at16.narr, 18, 'the story at Medium');
  assert.equal(at16.cmd, 17);
  for (const k of Object.keys(SEL)) assert.ok(at16[k] > 0, k + ' measured');
  // No px font size is left in the page's CSS (media queries and borders stay px).
  const pxLeft = await page.evaluate(() => {
    const out = [];
    const walk = list => { for (const r of list) { if (r.style) for (const p of ['font-size', 'font']) { const v = r.style.getPropertyValue(p); if (/\d+(\.\d+)?px/.test(v) && !/var\(/.test(v)) out.push(`${r.selectorText} ${p}: ${v}`); } if (r.cssRules) walk(r.cssRules); } };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { /* cross-origin */ } }
    return out;
  });
  assert.deepEqual(pxLeft, [], 'font sizes in px');
  // A larger browser default (the root at 20px): everything grows by 1.25.
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
  const at20 = await sizes();
  for (const k of Object.keys(SEL)) assert.ok(Math.abs(at20[k] / at16[k] - 1.25) < 0.01, `${k}: ${at16[k]} → ${at20[k]}`);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  // Text size: Large makes the interface an eighth bigger and the story 20px; Small keeps the interface, the story 16px.
  await page.evaluate(() => { Game.Storage.saveSettings({ textSize: 'L' }); Game.UI.applyDisplay(); });
  const big = await sizes();
  assert.equal(big.narr, 20, 'the story at Large');
  for (const k of Object.keys(SEL).filter(k => k !== 'narr')) assert.ok(Math.abs(big[k] / at16[k] - 1.125) < 0.01, `Large, ${k}: ${at16[k]} → ${big[k]}`);
  await page.evaluate(() => { Game.Storage.saveSettings({ textSize: 'S' }); Game.UI.applyDisplay(); });
  const small = await sizes();
  assert.equal(small.narr, 16, 'the story at Small');
  assert.equal(small.body, 15, 'the interface at Small as at Medium');
  // A phone at Large: the fields stay 16px or more (iOS does not zoom), nothing wider than the screen.
  const phone = await h.open({ viewport: PHONE });
  await phone.evaluate(() => { Game.Storage.saveSettings({ textSize: 'L' }); Game.UI.applyDisplay(); });
  await quickStart(phone);
  const ph = await phone.evaluate(() => ({ cmd: parseFloat(getComputedStyle(document.getElementById('cmd')).fontSize), wide: document.documentElement.scrollWidth <= innerWidth }));
  assert.ok(ph.cmd >= 16 && ph.wide, JSON.stringify(ph));
  // A short screen (320x568) at Large keeps the interface at the browser's size (room for the card table), the story 20px.
  await phone.setViewportSize({ width: 320, height: 568 });
  const short = await phone.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), narr: parseFloat(getComputedStyle(document.querySelector('#feed .f-narr')).fontSize) }));
  assert.deepEqual(short, { body: 15, narr: 20 });
});

s.test('each narration has a heading only screen readers meet ("Turn N", the arrival "Arrival"), the same after the feed is drawn again; the text stays the narration', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await sendText(page, 'look around');
  await sendText(page, 'wait a moment');
  const read = () => page.evaluate(() => [...document.querySelectorAll('#feed .f-narr')].map(n => {
    const hd = n.querySelector(':scope > h2.f-turn-h');
    return { label: hd ? hd.dataset.label : null, first: n.firstElementChild === hd, hidden: !!hd && hd.classList.contains('visually-hidden'), drawn: hd ? getComputedStyle(hd, '::before').content : null, text: n.textContent, inner: n.innerText };
  }));
  const live = await read();
  const log = await page.evaluate(() => Game.state.log.filter(e => e.narration).map(e => ({ turn: e.turn, narration: e.narration })));
  assert.equal(live.length, log.length);
  assert.deepEqual(live.map(x => x.label), log.map(e => (e.turn ? `Turn ${e.turn}` : 'Arrival')));
  assert.ok(live.every(x => x.first && x.hidden), 'first in the node, visually hidden');
  assert.ok(live.every(x => x.drawn === `"${x.label}"`), 'its words drawn by CSS');
  assert.ok(live.every(x => !x.text.includes('Turn ') && !x.inner.includes('Turn ')), 'the narration text is its own');
  // Screen readers get the headings (Playwright's view of the accessibility tree).
  const tree = await page.locator('#feed').ariaSnapshot();
  assert.match(tree, /^- log/);
  for (const x of live) assert.ok(tree.includes(`heading "${x.label}" [level=2]`), 'in the tree: ' + x.label);
  assert.equal(await page.getByRole('heading', { name: 'Turn 1', exact: true }).count(), 1);
  // Drawn again (a reload of the same game): the same headings.
  await page.evaluate(() => Game.UI.rebuildFeed());
  assert.deepEqual((await read()).map(x => x.label), live.map(x => x.label));
  // While the narration streams, the heading is there and the "…" placeholder still shows.
  const pend = await page.evaluate(() => {
    const n = Game.UI.feed.beginNarration({});
    const r = { label: n.querySelector('h2.f-turn-h') && n.querySelector('h2.f-turn-h').dataset.label, dots: getComputedStyle(n, '::before').content, live: document.getElementById('feed').getAttribute('aria-live') };
    Game.UI.feed.endNarration(n, 'Done.');
    r.after = getComputedStyle(n, '::before').content;
    r.liveAfter = document.getElementById('feed').getAttribute('aria-live');
    n.remove();
    return r;
  });
  assert.deepEqual(pend, { label: `Turn ${await page.evaluate(() => Game.state.meta.turn)}`, dots: '"…"', live: 'off', after: 'none', liveAfter: 'polite' });
});

s.test('the status line has a polite live region, always on the page, that says each stage once', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const live = await page.evaluate(() => { const l = document.getElementById('turn-status-live'); return { role: l.getAttribute('role'), live: l.getAttribute('aria-live'), atomic: l.getAttribute('aria-atomic'), exposed: l.getClientRects().length > 0 && !l.closest('[hidden]'), inMain: !!l.closest('main'), old: document.getElementById('turn-status').getAttribute('role') }; });
  assert.deepEqual(live, { role: 'status', live: 'polite', atomic: 'true', exposed: true, inMain: true, old: null });
  await page.evaluate(() => {
    window.__said = [];
    const l = document.getElementById('turn-status-live');
    new MutationObserver(() => window.__said.push(l.textContent)).observe(l, { childList: true, characterData: true, subtree: true });
    Game.Api.Mock.delay = 30;
  });
  await sendText(page, 'look around');
  const said = await page.evaluate(() => window.__said.filter(Boolean));
  assert.ok(said.length >= 1, 'something was said: ' + JSON.stringify(said));
  for (let i = 1; i < said.length; i++) assert.notEqual(said[i], said[i - 1], 'not twice in a row');
  assert.ok(said.every(t => /…$|hand|table|game/i.test(t)), JSON.stringify(said));
  assert.equal(await page.textContent('#turn-status-live'), '', 'quiet once the turn is over');
  assert.equal(await page.evaluate(() => document.getElementById('turn-status').hidden), true);
});

s.test('reduced motion: no transition or animation runs on the feed or the phone sheet', async h => {
  const page = await h.open({ viewport: PHONE });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await quickStart(page);
  await sendText(page, 'look around');
  const feed = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#feed > *')];
    return { anims: document.getAnimations().length, slow: items.map(e => getComputedStyle(e)).filter(cs => cs.animationName !== 'none' || parseFloat(cs.transitionDuration) > 0).length, n: items.length };
  });
  assert.ok(feed.n > 0);
  assert.deepEqual([feed.anims, feed.slow], [0, 0], 'feed: ' + JSON.stringify(feed));
  await page.click('[data-open-tab="journal"]');
  await page.waitForSelector('#game-body.sheet-open');
  const sheet = await page.evaluate(() => {
    const p = document.getElementById('panel');
    const cs = getComputedStyle(p);
    return { dur: cs.transitionDuration, running: document.getAnimations().filter(a => a.playState === 'running').map(a => a.constructor.name + ':' + (a.transitionProperty || a.animationName)), visible: cs.visibility, transform: cs.transform };
  });
  assert.deepEqual(sheet.running, [], 'nothing runs as the sheet opens');
  assert.ok(sheet.dur.split(',').every(d => parseFloat(d) === 0), 'sheet transitions 0s: ' + sheet.dur);
  assert.equal(sheet.visible, 'visible');
  // And without the preference, the sheet still slides (the rule is the preference's only).
  const plain = await h.open({ viewport: PHONE });
  assert.ok(await plain.evaluate(() => parseFloat(getComputedStyle(document.getElementById('panel')).transitionDuration) > 0));
});

s.test('the focus is not lost: the phone sheet gives it back to its opener (× and Escape), Settings back to the game, a feed drawn again to the box', async h => {
  const phone = await h.open({ viewport: PHONE });
  await quickStart(phone);
  for (const how of ['close', 'escape']) {
    await phone.focus('[data-open-tab="people"]');
    await phone.keyboard.press('Enter');
    await phone.waitForSelector('#game-body.sheet-open');
    assert.ok(await phone.evaluate(() => document.getElementById('panel').contains(document.activeElement)), 'the focus goes into the sheet');
    if (how === 'close') await phone.click('#panel-close'); else await phone.keyboard.press('Escape');
    await phone.waitForFunction(() => !document.getElementById('game-body').classList.contains('sheet-open'));
    assert.equal(await phone.evaluate(() => document.activeElement.dataset.openTab), 'people', 'back on the opener after ' + how);
  }
  // Settings and back (the phone's Menu): the focus lands on the game, not the page.
  await phone.click('#tb-menu');
  await phone.click('[data-menu="settings"]');
  await phone.click('#settings-done');
  assert.ok(await phone.evaluate(() => document.activeElement !== document.body && document.getElementById('screen-game').contains(document.activeElement)), 'phone: back in the game');
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.click('#tb-settings');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-title');
  await page.click('#settings-done');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'laptop: the box');
  // A control in the story (a failed turn's Try again) is gone when the feed is drawn again: the focus goes to the box.
  await page.evaluate(() => Game.UI.feed.notice('The narrator could not be reached. Your action was kept in the box.', 'error'));
  await page.focus('#feed [data-retry]');
  await page.evaluate(() => Game.UI.rebuildFeed());
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'not dropped to the page');
  // Focus elsewhere is left alone.
  await page.focus('#tb-save');
  await page.evaluate(() => Game.UI.rebuildFeed());
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tb-save');
});

s.run();
