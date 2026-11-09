'use strict';
/* Wave 37, Creator Mode, milestone 8 (task M8-B; plan decision D, the
   per-pack player layer's adultOk; decision J; "Decisions and deviations"
   5: Low Water is rated adult, "a one-time 18+ ask on New game for every
   player"). Pack.needsConsent is true for a story rated adult and for one
   whose pack layer writes the intimate direction, false otherwise. Every
   way into a game of such a story asks first (UI.askConsent: the title, the
   rating chip, the content warnings as text, "I am 18 or older" enabling
   Continue, and Not now): New game before character creation, Continue and
   Load before the game screen, a test from a draft before the test game.
   Not now changes nothing and writes nothing; a yes writes
   perPack[id].adultOk and is not asked again. Pipeline.runTurn refuses a
   turn without the yes, with a notice, and nothing reaches the Api (mock
   mode: Api.Mock.calls; Api.responses, the transport's record). Settings'
   Play shows the yes with Forget, which clears it so the next New game asks
   again. A hostile content warning (a script tag, 2,000 characters) shows
   as text, cut. The dialog passes the mobile audit at 375 and 390.
   Screenshots of the dialog at 390x844 and 1280x800 in the Dark and
   Parchment themes go to $UI_SHOTS when it names a folder (none without it).
   Every page here opens without the helpers' pre-consent (open({ consent:
   false }), tests/helpers.cjs) unless a test says otherwise.
   Run with: node tests/run.cjs wave37-rating */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave37-rating');
const KEY = 'novatria.settings';
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};
const SENTENCE = 'This story has adult content. To play it, confirm you are 18 or older.';
const NOTICE = 'This story needs your confirmation first; open Settings or start it again from the title.';

/* A page with no 18+ yes given (unless consent is true), the Library and drafts read, and the mock answering at once. */
async function open(h, opts) {
  const page = await h.open(Object.assign({ consent: false, contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
// Low Water's adultOk as the page has it and as localStorage holds it (undefined when absent).
const adultOk = (page, id) => page.evaluate(([k, x]) => {
  const stored = JSON.parse(localStorage.getItem(k) || '{}');
  const e = stored.perPack && stored.perPack[x];
  return { live: Game.Storage.perPack(x).adultOk, stored: e ? e.adultOk : undefined };
}, [KEY, id || 'low-water']);
const dialogOpen = page => page.evaluate(() => document.getElementById('consent').open);
const waitDialog = page => page.waitForSelector('#consent[open]');
// What the open dialog shows.
const dialog = page => page.evaluate(() => ({
  title: document.getElementById('consent-title').textContent,
  rating: document.getElementById('consent-rating').textContent,
  tint: document.getElementById('consent-rating').dataset.rating,
  warns: [...document.querySelectorAll('#consent-warnings li')].map(li => li.textContent),
  text: document.getElementById('consent-text').textContent,
  check: document.getElementById('consent-check').checked,
  yesOff: document.getElementById('consent-yes').disabled,
  yes: document.getElementById('consent-yes').textContent,
  no: document.getElementById('consent-no').textContent,
  focus: document.activeElement && document.activeElement.id
}));
const toTitle = page => page.evaluate(() => Game.UI.showScreen('title'));

s.test('Pack.needsConsent: true for the built-in pack (rated adult) and for a general-rated copy whose pack layer sets directions.intimate, false for a general-rated copy without one; promptAllowed follows perPack[id].adultOk', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    const plain = P.copy(b); plain.meta.id = 'plain-copy'; plain.meta.rating = 'general';
    const hot = P.copy(plain); hot.meta.id = 'hot-copy'; hot.directions = { intimate: 'INTIMATE SCENE. Written out, warmly.' };
    const teen = P.copy(plain); teen.meta.rating = 'teen';
    const before = [P.promptAllowed(b), P.promptAllowed(hot), P.promptAllowed(plain)];
    Game.Storage.savePerPack('low-water', { adultOk: true });
    const after = P.promptAllowed(b);
    // A player's own intimate direction (the player layer) is not the pack's: it asks nothing of a general story.
    Game.Storage.savePerPack('plain-copy', { overrides: { 'directions.intimate': 'Mine' } });
    return { rating: b.meta.rating, needs: [P.needsConsent(b), P.needsConsent(hot), P.needsConsent(plain), P.needsConsent(teen), P.needsConsent(null)], before, after, ownDir: P.needsConsent(plain) };
  });
  assert.equal(r.rating, 'adult');
  assert.deepEqual(r.needs, [true, true, false, false, false]);
  assert.deepEqual(r.before, [false, false, true], 'no yes yet: the adult and the intimate story are held, the general one plays');
  assert.equal(r.after, true, 'the yes lets it play');
  assert.equal(r.ownDir, false);
});

s.test('New game asks before character creation: Not now leaves the title with no game and writes nothing; the box enables Continue; a yes writes perPack["low-water"].adultOk and reaches character creation; a second New game does not ask', async h => {
  const page = await open(h);
  await page.click('#btn-new');
  await waitDialog(page);
  const d = await dialog(page);
  const meta = await page.evaluate(() => Game.Pack.builtIn().meta);
  assert.equal(d.title, meta.title);
  assert.deepEqual([d.rating, d.tint], ['adult', 'adult']);
  assert.deepEqual(d.warns, meta.contentWarnings, 'the story\'s own content warnings, in order');
  assert.ok(d.warns.length >= 2);
  assert.equal(d.text, SENTENCE);
  assert.deepEqual([d.check, d.yesOff, d.yes, d.no, d.focus], [false, true, 'Continue', 'Not now', 'consent-no'], 'unticked, Continue off, the safe answer focused');
  assert.equal(await page.evaluate(() => document.getElementById('consent').getAttribute('aria-describedby')), 'consent-text');
  await page.click('#consent-no');
  await page.waitForFunction(() => !document.getElementById('consent').open);
  const after = await page.evaluate(() => ({ screen: Game.UI.screen, inGame: Game.App.inGame(), state: !!Game.state, focus: document.activeElement && document.activeElement.id }));
  assert.deepEqual(after, { screen: 'title', inGame: false, state: false, focus: 'btn-new' }, 'the title as it was, the focus back on New game');
  assert.deepEqual(await adultOk(page), { live: undefined, stored: undefined }, 'Not now writes nothing');
  // Again: the box alone enables Continue.
  await page.click('#btn-new');
  await waitDialog(page);
  await page.click('#consent-yes', { force: true }).catch(() => {});
  assert.equal(await dialogOpen(page), true, 'Continue does nothing while unticked');
  await page.click('label.consent-check');
  assert.equal(await page.evaluate(() => document.getElementById('consent-yes').disabled), false);
  await page.click('label.consent-check');
  assert.equal(await page.evaluate(() => document.getElementById('consent-yes').disabled), true, 'unticking turns it off again');
  await page.check('#consent-check');
  await page.click('#consent-yes');
  await page.waitForSelector('#screen-create.active');
  assert.equal(await dialogOpen(page), false);
  assert.deepEqual(await adultOk(page), { live: true, stored: true });
  await toTitle(page);
  await page.click('#btn-new');
  await page.waitForSelector('#screen-create.active');
  assert.equal(await dialogOpen(page), false, 'asked once per story');
  // The yes is per story: another pack's entry is untouched.
  assert.deepEqual(await adultOk(page, 'low-water-test'), { live: undefined, stored: undefined });
});

s.test('Continue of an autosave of an adult story asks when adultOk is unset (Not now leaves the title, nothing written) and plays after the yes; with it set Continue plays at once; Load of a slot asks the same way', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.waitForFunction(() => Game.Storage.hasAutosave());
  assert.ok(await page.evaluate(() => Game.Storage.saveSlot(1, 'Before the vote')));
  await page.evaluate(() => Game.Storage.savePerPack('low-water', { adultOk: null }));
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.deepEqual(await adultOk(page), { live: undefined, stored: undefined });
  await page.click('#btn-continue');
  await waitDialog(page);
  assert.equal((await dialog(page)).title, 'Low Water');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('consent').open);
  assert.deepEqual(await page.evaluate(() => ({ screen: Game.UI.screen, inGame: Game.App.inGame() })), { screen: 'title', inGame: false }, 'Escape is Not now');
  assert.deepEqual(await adultOk(page), { live: undefined, stored: undefined });
  await page.click('#btn-continue');
  await waitDialog(page);
  await page.check('#consent-check');
  await page.click('#consent-yes');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.evaluate(() => Game.App.inGame()), true);
  assert.deepEqual(await adultOk(page), { live: true, stored: true });
  // With the yes kept: Continue plays at once, as before (a boolean, no dialog).
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.equal(await page.evaluate(() => Game.App.continueGame()), true);
  assert.equal(await dialogOpen(page), false);
  // Load of a slot: asked again once the yes is forgotten; Not now loads nothing.
  await page.evaluate(() => { Game.Storage.savePerPack('low-water', { adultOk: null }); Game.App.quitToTitle(); });
  const p = page.evaluate(() => Game.App.loadSlot(1));
  await waitDialog(page);
  await page.click('#consent-no');
  assert.equal(await p, false);
  assert.deepEqual(await page.evaluate(() => ({ screen: Game.UI.screen, inGame: Game.App.inGame() })), { screen: 'title', inGame: false });
});

s.test('Test from a draft asks the same way (mock mode): Not now stays in the editor with no game, a yes writes the draft\'s own adultOk and starts the test game', async h => {
  const page = await open(h);
  if (!(await page.evaluate(() => !!(Game.Creator && Game.Creator.Test && Game.Creator.Test.start)))) { console.log('        note: Creator.Test (M7-A) is absent; skipped'); return; }
  const draftId = await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'low-water-test';
    return Game.Storage.Drafts.put({ pack: p }).id;
  });
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  await page.evaluate(() => Game.Creator.renderLibrary());
  await page.click(`#creator-cards .cr-card[data-id="${draftId}"] [data-action=open]`);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  const start = () => page.evaluate(() => { window.__r = Game.Creator.Test.start(Game.Creator.state.draft, Game.Creator.Test.choice()); });
  await start();
  await waitDialog(page);
  assert.equal((await dialog(page)).title, 'Low Water');
  await page.click('#consent-no');
  assert.equal(await page.evaluate(() => window.__r), false);
  assert.deepEqual(await page.evaluate(() => ({ screen: Game.UI.screen, inGame: Game.App.inGame(), state: !!Game.state })), { screen: 'creator', inGame: false, state: false });
  assert.deepEqual(await adultOk(page, 'low-water-test'), { live: undefined, stored: undefined });
  await start();
  await waitDialog(page);
  await page.check('#consent-check');
  await page.click('#consent-yes');
  await page.waitForSelector('#screen-game.active');
  assert.deepEqual(await page.evaluate(() => [Game.state.meta.packSource, Game.State.pack.meta.id]), ['draft', 'low-water-test']);
  assert.deepEqual(await adultOk(page, 'low-water-test'), { live: true, stored: true });
  assert.deepEqual(await adultOk(page), { live: undefined, stored: undefined }, 'the yes is the draft\'s story\'s, not the built-in one\'s');
});

s.test('with adultOk cleared on a running game, a turn is refused with the notice and nothing reaches the Api (Api.Mock.calls and Api.responses gain no entry, the log no turn)', async h => {
  const page = await open(h, { consent: true });
  await quickStart(page);
  await sendText(page, 'look around');
  const before = await page.evaluate(() => ({ mock: Game.Api.Mock.calls.length, responses: Game.Api.responses.length, log: Game.state.log.length, turn: Game.state.meta.turn }));
  assert.ok(before.mock > 0, 'a turn with the yes reaches the (mock) Api');
  await page.evaluate(() => Game.Storage.savePerPack('low-water', { adultOk: null }));
  await sendText(page, 'walk to the river');
  const after = await page.evaluate(() => ({ mock: Game.Api.Mock.calls.length, responses: Game.Api.responses.length, log: Game.state.log.length, turn: Game.state.meta.turn }));
  assert.deepEqual(after, before, 'no call, no turn');
  const notices = await page.$$eval('#feed .f-notice', ns => ns.map(n => n.textContent));
  assert.ok(notices.includes(NOTICE), JSON.stringify(notices));
  const r = await page.evaluate(() => Game.Pipeline.submit('look around'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'consent');
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls.length), before.mock);
});

s.test('Settings: the Play fieldset shows "You confirmed you are 18 or older for this story." with Forget when adultOk is true, nothing when the story needs no yes; Forget clears it and the next New game asks again', async h => {
  const page = await open(h, { consent: true });
  await page.click('#btn-settings');
  await page.waitForSelector('#screen-settings.active');
  const shown = await page.evaluate(() => ({ hidden: document.getElementById('set-adult').hidden, text: document.getElementById('set-adult-text').textContent, btn: document.getElementById('set-adult-forget').textContent, h: document.getElementById('set-adult-forget').getBoundingClientRect().height }));
  assert.deepEqual([shown.hidden, shown.text, shown.btn], [false, 'You confirmed you are 18 or older for this story.', 'Forget']);
  assert.ok(shown.h >= 44, `Forget is ${shown.h}px tall`);
  await page.click('#set-adult-forget');
  assert.equal(await page.evaluate(() => document.getElementById('set-adult').hidden), true);
  assert.deepEqual(await adultOk(page), { live: undefined, stored: undefined }, 'adultOk: null deletes it');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'set-rolls', 'the focus stays in the fieldset');
  await page.click('#settings-done');
  await page.waitForSelector('#screen-title.active');
  await page.click('#btn-new');
  await waitDialog(page);
  await page.click('#consent-no');
  // A story that needs no yes: a general-rated test game shows nothing, even with an adultOk stored for it.
  const general = await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'general-copy'; p.meta.rating = 'general';
    Game.Storage.savePerPack('general-copy', { adultOk: true });
    const D = Game.data;
    const bg = D.BACKGROUNDS[0];
    const r = Game.App.newGameFrom(p, { name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Look around', flaw: D.FLAWS[0], looseEnds: ['debt', 'enemy', 'secret'].map(k => ({ kind: k, text: D.LOOSE_ENDS[k].options[0] })) }, { seed: 7 });
    return !!r && typeof r.then !== 'function';
  });
  assert.equal(general, true, 'a general story starts at once, unasked');
  assert.equal(await dialogOpen(page), false);
  await page.evaluate(() => Game.UI.showScreen('settings'));
  assert.equal(await page.evaluate(() => document.getElementById('set-adult').hidden), true);
});

s.test('a hostile content warning (a script tag, 2,000 characters) shows as text, cut at 120 characters; more than twelve show twelve and "and N more"; Escape resolves false and writes nothing', async h => {
  const page = await open(h);
  const r = await page.evaluate(async () => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'hostile-rated';
    p.meta.title = '<img src=x onerror="window.__pwned=1"> Hostile';
    p.meta.contentWarnings = ['<script>window.__pwned=1</script>', 'W'.repeat(2000)].concat(Array.from({ length: 13 }, (_, i) => `Warning ${i + 1}`));
    window.__answer = Game.UI.askConsent(p);
    await new Promise(res => setTimeout(res, 50));
    const lis = [...document.querySelectorAll('#consent-warnings li')];
    return {
      title: document.getElementById('consent-title').textContent,
      first: lis[0].textContent, second: lis[1].textContent.length, secondEnd: lis[1].textContent.slice(-1),
      n: lis.length, more: document.getElementById('consent-more').textContent, moreHidden: document.getElementById('consent-more').hidden,
      tags: document.querySelectorAll('#consent script, #consent img').length, pwned: window.__pwned
    };
  });
  assert.equal(r.title, '<img src=x onerror="window.__pwned=1"> Hostile');
  assert.equal(r.first, '<script>window.__pwned=1</script>');
  assert.deepEqual([r.second, r.secondEnd], [120, '…']);
  assert.deepEqual([r.n, r.more, r.moreHidden], [12, 'and 3 more', false]);
  assert.deepEqual([r.tags, r.pwned], [0, undefined], 'text, never markup');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__answer), false);
  assert.deepEqual(await adultOk(page, 'hostile-rated'), { live: undefined, stored: undefined });
});

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider than the screen. */
function audit(label) {
  const W = window.innerWidth;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  // With a modal dialog open only the dialog can be touched.
  const top = document.querySelector('dialog[open]') || document;
  const small = [...top.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...top.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
    .map(el => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16).map(x => `${x[0]} ${x[1]}px`);
  const scrolledInside = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'auto' && ox !== 'scroll') continue;
      const pr = p.getBoundingClientRect();
      if (pr.left >= -1 && pr.right <= W + 1) return true;
    }
    return false;
  };
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scrolledInside(el)) wide.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
  }
  for (const el of document.querySelectorAll('.page')) if (vis(el) && el.scrollWidth > el.clientWidth + 1) wide.push('scrolls sideways: ' + (el.id || el.className));
  if (document.documentElement.scrollWidth > W) wide.push('document ' + document.documentElement.scrollWidth);
  const d = document.querySelector('dialog[open]');
  const dr = d ? d.getBoundingClientRect() : null;
  const box = document.getElementById('consent-check').getBoundingClientRect();
  return { label, small, fonts, wide: wide.slice(0, 10), inside: !dr || (dr.left >= 0 && dr.right <= W && dr.top >= 0 && dr.bottom <= window.innerHeight + 1), box: [Math.round(box.width), Math.round(box.height)] };
}

s.test('the dialog passes the mobile audit at 375 and 390 (44px rows and buttons, a 16px box, nothing wider than the screen, the dialog inside it); screenshots at 390x844 and 1280x800 in the Dark and Parchment themes', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await page.click('#btn-new');
    await waitDialog(page);
    const a = await page.evaluate(audit, `consent ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide, a.inside], [[], [], [], true], JSON.stringify(a));
    assert.deepEqual(a.box, [16, 16]);
    const rows = await page.evaluate(() => ['label.consent-check', '#consent-yes', '#consent-no'].map(q => Math.round(document.querySelector(q).getBoundingClientRect().height)));
    assert.ok(rows.every(x => x >= 44), JSON.stringify(rows));
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      await page.click('#btn-new');
      await waitDialog(page);
      await shot(page, `consent-${vp.width}x${vp.height}-${theme}`);
      await page.check('#consent-check');
      await shot(page, `consent-ticked-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
