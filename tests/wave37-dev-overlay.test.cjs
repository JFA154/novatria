'use strict';
/* Wave 37, Creator Mode, milestone 7 (task M7-B; plan decision H, the
   Developer overlay): the game panel's Dev tab, for an author testing a
   story.
   - It is there in developer mode (Settings, Advanced) and in a test game
     (meta.packSource 'draft'), and nowhere else: with developer mode off in
     a normal game there is no Dev tab and UI.openPanel('dev') does nothing.
   - It shows the last packet (Pipeline.lastCtx.packet, with its token
     estimate), the narrator's last reply (Api.responses) and the style
     check (lastCtx.style).
   - It acts only through the engine's own entry points (plan decision J,
     fixed rule 1): Force the next roll arms Pipeline.hooks.nextTier, so the
     next roll comes out critical with no die drawn (meta.rngCalls, as
     wave34's test (h) checks); Set the clock runs Pipeline.setClock (the
     time moves, the feed's divider is written); Place someone here applies
     the npcMove effect, so the person is PRESENT in the next packet.
   - Commands.allowed: a story that hides /cheat (rules.cheats.allowed
     false) hides it from a player without developer mode, and shows it in
     developer mode and in a test game.
   - The tab passes the mobile audit at 375 and 390 (44px targets, 16px
     inputs, nothing wider than the screen); screenshots of it at 390x844
     and 1280x800 in the Dark and Parchment themes go to $UI_SHOTS when it
     names a folder.
   Mock mode. Run with: node tests/run.cjs wave37-dev-overlay */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave37-dev-overlay');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

async function start(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page, { kinds: [] });
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
  return page;
}
const tabIds = page => page.$$eval('#panel-tabs [role="tab"]', b => b.map(x => x.dataset.tab));
const developer = (page, on) => page.evaluate(v => { Game.Storage.saveSettings({ developerMode: v }); Game.UI.renderPanel(); }, on);
const openDev = async page => { await page.evaluate(() => Game.UI.openPanel('dev')); await page.waitForSelector('#panel-body .dev'); };
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider
   than the screen (a strip or grid that scrolls sideways on purpose is scrolled, not wide). */
function audit(label) {
  const W = window.innerWidth;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  const scope = document.querySelector('#panel');
  const small = [...scope.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...scope.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
    .map(el => [el.dataset.dev || el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16).map(x => `${x[0]} ${x[1]}px`);
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
  for (const el of document.querySelectorAll('.page, .panel-body')) if (vis(el) && el.scrollWidth > el.clientWidth + 1) wide.push('scrolls sideways: ' + (el.id || el.className));
  if (document.documentElement.scrollWidth > W) wide.push('document ' + document.documentElement.scrollWidth);
  return { label, small, fonts, wide: wide.slice(0, 10) };
}

s.test('developer mode off in a normal game: no Dev tab and openPanel(\'dev\') does nothing; ticked in Settings, the tab is there on the way back, and shows the last packet (Pipeline.lastCtx.packet, its token estimate), the narrator\'s last reply and the style check', async h => {
  const page = await start(h);
  await sendText(page, 'I look around');
  const off = await page.evaluate(() => { const before = Game.UI.tab; Game.UI.openPanel('dev'); return { devOn: Game.UI.devOn(), before, after: Game.UI.tab, drawn: !!document.querySelector('#panel-body .dev') }; });
  assert.deepEqual(await tabIds(page), ['character', 'people', 'journal', 'objectives', 'places']);
  assert.deepEqual(off, { devOn: false, before: off.before, after: off.before, drawn: false }, 'openPanel(\'dev\') does nothing');
  assert.ok(!(await page.$('[data-dev]')), 'no Dev control anywhere');
  // Settings, Advanced, Developer mode, then back to the game: the tabs are drawn again with Dev after the others.
  await page.evaluate(() => Game.UI.showScreen('settings'));
  await page.evaluate(() => { document.getElementById('set-advanced').open = true; });
  await page.check('#set-developer');
  assert.equal(await page.evaluate(() => Game.Storage.settings().developerMode), true);
  await page.evaluate(() => Game.UI.showScreen('game'));
  assert.deepEqual(await tabIds(page), ['character', 'people', 'journal', 'objectives', 'places', 'dev']);
  // With /debug on too, Dev comes after Debug.
  await page.evaluate(() => Game.UI.toggleDebug(true));
  assert.deepEqual(await tabIds(page), ['character', 'people', 'journal', 'objectives', 'places', 'debug', 'dev']);
  await page.evaluate(() => Game.UI.toggleDebug(false));
  await page.click('#tab-dev');
  await page.waitForSelector('#panel-body .dev');
  const r = await page.evaluate(() => {
    const G = Game, ctx = G.Pipeline.lastCtx;
    const reply = [...G.Api.responses].reverse().find(x => x.role === 'narrator');
    const sec = n => document.querySelector(`#panel-body [data-dev="${n}"]`);
    return {
      packet: ctx.packet, shown: sec('packet').querySelector('pre').textContent,
      tokens: sec('packet').querySelector('[data-dev="tokens"]').textContent, est: G.Pack.tokenEstimate(ctx.packet).toLocaleString('en-US') + ' tokens',
      copy: !!sec('packet').querySelector('[data-dev="copy-packet"]:not([disabled])'),
      replyData: reply && reply.data, replyShown: sec('reply').querySelector('pre').textContent, replyHead: sec('reply').querySelector('.dev-meta').textContent,
      style: ctx.style, styleShown: [...sec('style').querySelectorAll('li')].map(li => li.textContent),
      heads: [...document.querySelectorAll('#panel-body .dev h3')].map(x => x.textContent),
      ids: [...document.querySelectorAll('#panel-body .dev *')].filter(x => x.id).map(x => x.id)
    };
  });
  assert.ok(r.packet && /^ROLL: /m.test(r.packet), 'a narrator packet');
  assert.equal(r.shown, r.packet, 'the last packet, whole');
  assert.equal(r.tokens, r.est);
  assert.ok(r.copy, 'a Copy button');
  assert.equal(typeof r.replyData.text, 'string');
  assert.equal(r.replyShown, r.replyData.text, 'the reply\'s text');
  assert.match(r.replyHead, /via mock/);
  assert.ok(Array.isArray(r.style) && r.style.length >= 1);
  const want = r.style.flatMap((c, i) => {
    const tag = r.style.length > 1 ? (i === 0 ? 'First draft: ' : 'Rewrite: ') : '';
    return c.problems.length ? c.problems.map(p => tag + p.detail) : [tag + 'clean'];
  });
  assert.deepEqual(r.styleShown, want, 'each problem\'s detail, or clean');
  assert.deepEqual(r.heads, ['Last packet', 'Last reply', 'Style check', 'Force the next roll', 'Set the clock', 'Place someone here', 'Commands']);
  assert.deepEqual(r.ids, [], 'no element ids: the controls carry data-dev');
});

s.test('Force the next roll: Critical arms Pipeline.hooks.nextTier and the next roll is critical on the ROLL line with no die drawn; a roll after it draws its die; the d20 field arms nextD20 and Clear disarms both', async h => {
  const page = await start(h);
  await developer(page, true);
  await openDev(page);
  assert.equal(await page.textContent('[data-dev="pending"]'), 'Nothing forced.');
  await page.click('[data-dev="tier-critical"]');
  assert.deepEqual(await page.evaluate(() => [Game.Pipeline.hooks.nextTier, Game.Pipeline.hooks.nextD20]), ['critical', null]);
  assert.equal(await page.textContent('[data-dev="pending"]'), 'Next roll: a critical.');
  assert.equal(await page.getAttribute('[data-dev="tier-critical"]', 'aria-pressed'), 'true');
  const c0 = await page.evaluate(() => Game.state.meta.rngCalls);
  await sendText(page, 'I try to read the faded sign');
  const a = await page.evaluate(c => ({ rng: Game.state.meta.rngCalls - c, roll: (Game.Pipeline.lastCtx.packet.match(/^ROLL: .*$/m) || [''])[0], tier: Game.state.log[Game.state.log.length - 1].roll.tier, armed: Game.Pipeline.hooks.nextTier }), c0);
  assert.match(a.roll, /^ROLL: \w+ 20 vs \d+ · Critical$/);
  assert.equal(a.tier, 'critical');
  assert.equal(a.rng, 0, 'the forced die: none drawn from the stream');
  assert.equal(a.armed, null, 'spent by the roll');
  const c1 = await page.evaluate(() => Game.state.meta.rngCalls);
  await sendText(page, 'I try to read the faded sign again');
  assert.equal(await page.evaluate(c => Game.state.meta.rngCalls - c, c1), 1, 'unforced, the roll draws its die');
  // The die field, then Clear.
  await openDev(page);
  await page.fill('[data-dev="d20"]', '3');
  await page.click('[data-dev="set-d20"]');
  assert.deepEqual(await page.evaluate(() => [Game.Pipeline.hooks.nextTier, Game.Pipeline.hooks.nextD20]), [null, 3]);
  assert.equal(await page.textContent('[data-dev="pending"]'), 'Next roll: a 3 on the die.');
  await page.click('[data-dev="tier-fumble"]');
  assert.deepEqual(await page.evaluate(() => [Game.Pipeline.hooks.nextTier, Game.Pipeline.hooks.nextD20]), ['fumble', null], 'one force at a time');
  await page.click('[data-dev="clear-roll"]');
  assert.deepEqual(await page.evaluate(() => [Game.Pipeline.hooks.nextTier, Game.Pipeline.hooks.nextD20]), [null, null]);
  assert.equal(await page.textContent('[data-dev="pending"]'), 'Nothing forced.');
});

s.test('Set the clock to night runs Pipeline.setClock: State.current.time moves and the feed writes the divider; Place someone here moves a person by the npcMove effect, so they are PRESENT in the next packet', async h => {
  const page = await start(h);
  await developer(page, true);
  await openDev(page);
  const day = await page.evaluate(() => Game.state.time.day);
  await page.selectOption('[data-dev="phase"]', 'night');
  await page.click('[data-dev="set-clock"]');
  const c = await page.evaluate(() => {
    const d = [...document.querySelectorAll('#feed .f-divider')].pop();
    return { time: Game.state.time.phase, day: Game.state.time.day, divider: d ? [d.dataset.day, d.dataset.phase] : null, quiet: [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent).pop() };
  });
  assert.equal(c.time, 'night');
  assert.equal(c.day, day);
  assert.deepEqual(c.divider, [String(day), 'night']);
  assert.equal(c.quiet, `Clock set to Day ${day} · Night.`);
  // Someone not here: their schedule for the night is the player's place now.
  await openDev(page);
  const who = await page.evaluate(() => {
    const G = Game, st = G.state;
    const opts = [...document.querySelectorAll('[data-dev="who"] option')].map(o => o.value);
    const here = new Set(G.State.npcsAt(st.player.locationId).map(n => n.id));
    const id = opts.find(x => !here.has(x));
    return { id, name: G.State.npc(id).name, everyAway: opts.every(x => !here.has(x)), opts: opts.length };
  });
  assert.ok(who.id && who.everyAway && who.opts > 0, 'the select lists the living people not here');
  await page.selectOption('[data-dev="who"]', who.id);
  await page.click('[data-dev="place-here"]');
  const p = await page.evaluate(id => ({ here: Game.State.npcsAt(Game.state.player.locationId).some(n => n.id === id), listed: [...document.querySelectorAll('[data-dev="who"] option')].some(o => o.value === id) }), who.id);
  assert.deepEqual(p, { here: true, listed: false });
  await sendText(page, 'I look around');
  const present = await page.evaluate(() => (Game.Pipeline.lastCtx.packet.match(/^PRESENT: .*$/m) || [''])[0]);
  assert.ok(present.includes(who.name), `${who.name} in PRESENT: ${present.slice(0, 200)}`);
});

s.test('a story that hides /cheat (rules.cheats.allowed false): hidden for a player without developer mode, shown in developer mode, and shown in a test game (meta.packSource \'draft\') with the Dev tab; the Commands buttons run through the box\'s path', async h => {
  const page = await h.open({ contextOptions: { reducedMotion: 'reduce' } });
  await page.evaluate(() => { const P = Game.Pack; const c = P.copy(P.builtIn()); c.rules = { cheats: { allowed: false } }; P.setPreview(c); Game.Api.Mock.delay = 0; });
  await quickStart(page, { kinds: [] });
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
  const read = () => page.evaluate(() => ({ cheat: Game.Commands.allowed('/cheat'), reroll: Game.Commands.allowed('/reroll'), help: /^\/cheat /m.test(Game.Commands.helpText()), devOn: Game.UI.devOn() }));
  assert.deepEqual(await read(), { cheat: false, reroll: false, help: false, devOn: false }, 'a player: hidden');
  await sendText(page, '/cheat success');
  assert.equal(await lastNotice(page), 'Not in this story.');
  await developer(page, true);
  assert.deepEqual(await read(), { cheat: true, reroll: true, help: true, devOn: true }, 'developer mode: shown');
  await developer(page, false);
  assert.deepEqual(await read(), { cheat: false, reroll: false, help: false, devOn: false });
  // A test game (M7-A's Test sets meta.packSource; set here on the state directly).
  await page.evaluate(() => { Game.state.meta.packSource = 'draft'; Game.UI.renderPanel(); });
  assert.deepEqual(await read(), { cheat: true, reroll: true, help: true, devOn: true }, 'a test game: shown');
  assert.equal(await page.evaluate(() => Game.Commands.allowed('/fact')), true, '/fact still follows its story rule');
  assert.ok((await tabIds(page)).includes('dev'), 'the Dev tab in a test game');
  await openDev(page);
  const cmds = await page.$$eval('[data-dev^="cmd-"]', b => b.map(x => [x.dataset.dev, x.textContent]));
  assert.deepEqual(cmds.slice(0, 3), [['cmd-debug', '/debug'], ['cmd-reroll', '/reroll'], ['cmd-cheat', '/cheat']]);
  // /cheat opens the cheat help (a notice in the feed), through the same path as the ⋯ list.
  await page.click('[data-dev="cmd-cheat"]');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.match(await lastNotice(page), /^Cheats: \/cheat success/);
  await openDev(page);
  await page.click('[data-dev="cmd-debug"]');
  assert.equal(await page.evaluate(() => Game.UI.debug), true, '/debug turned the debug view on');
  // /edit names the first person here with a People card (made known here through the engine's own op).
  const known = await page.evaluate(() => { const n = Game.State.npcsAt(Game.state.player.locationId)[0]; if (!n) return null; Game.State.apply({ npcKnownToPlayer: [n.id] }); return { id: n.id, first: n.name.split(' ')[0] }; });
  assert.ok(known, 'someone is here at the start');
  await openDev(page);
  assert.equal(await page.textContent('[data-dev="cmd-edit"]'), `/edit ${known.first}`);
  await page.click('[data-dev="cmd-edit"]');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.UI.editing), known.id, '/edit opened that person\'s card on the People tab');
  // Back to a normal game: the Dev tab goes with it.
  await page.evaluate(() => { delete Game.state.meta.packSource; Game.UI.renderPanel(); });
  assert.ok(!(await tabIds(page)).includes('dev'));
  assert.equal(await page.evaluate(() => { Game.UI.openPanel('dev'); return Game.UI.tab; }) === 'dev', false);
  await page.evaluate(() => Game.Pack.setPreview(null));
});

s.test('the Dev tab passes the mobile audit at 375 and 390 (44px targets, 16px inputs, nothing wider than the screen); screenshots at 390x844 and 1280x800, Dark and Parchment', async h => {
  for (const vp of SIZES) {
    const page = await start(h, { viewport: vp });
    await developer(page, true);
    await sendText(page, 'I look around');
    await openDev(page);
    await page.waitForFunction(() => document.querySelector('.game-body.sheet-open, #game-body.sheet-open') || document.querySelector('#panel-body .dev'));
    const a = await page.evaluate(audit, `dev ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await start(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await page.evaluate(t => { Game.Storage.saveSettings({ developerMode: true, theme: t }); Game.UI.applyDisplay(); }, theme === 'dark' ? 'dark' : 'parchment');
      await sendText(page, 'I look around');
      await openDev(page);
      await page.waitForTimeout(250);
      await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.getElementById('panel-body').scrollTop = 0; });
      await shot(page, `dev-top-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.querySelector('#panel-body [data-dev="roll"]').scrollIntoView({ block: 'start' }));
      await shot(page, `dev-controls-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
