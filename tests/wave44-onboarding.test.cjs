'use strict';
/* Wave 44: the first five minutes, and the player's data on this device.
   - The key card ("Play with Claude") lists the steps to get a key (an
     account at the console, credit, a monthly spend limit, a key), names
     the preset the game starts on and says what Remember means, and fits a
     375x740 phone with no sideways overflow.
   - Settings, "This device": Forget key takes the key out of both storages
     and both fields, keeps everything else, and New game asks how to play
     again; Delete all game data on this device asks first (naming what
     goes), then clears localStorage, sessionStorage and the IndexedDB undo
     database and comes back as a fresh profile on the title screen, from
     file:// and over http://.
   - A fresh profile shows no dead Continue; an autosave brings it back.
   - The first-turn tip suggests things from the opening scene (a person
     here, a place next door, a thing to look at), for both start places,
     and on a phone on its side with the keyboard up it is one "Tips" line
     that opens on a tap, the focus staying in the box.
   Mock mode. Run with: node tests/run.cjs wave44 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, fixtures, ROOT, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('wave44-onboarding');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));

/* A static host for the http:// runs (as tests/static-host.test.cjs). */
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function startServer() {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep) || rel.split('/').some(p => p.startsWith('.') && p.length > 0)) { res.writeHead(404); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server)); });
}
let base = '';
const openHttp = (h, viewport) => open(h, viewport, {
  url: base + '/index.html',
  route: route => { const u = route.request().url(); return u.startsWith(base + '/') || /^(blob|data):/.test(u) ? route.continue() : route.abort(); }
});

/* Everything the game keeps in this browser, as names. */
const stores = page => page.evaluate(async () => {
  const keys = st => { const out = []; for (let i = 0; i < st.length; i++) out.push(st.key(i)); return out.sort(); };
  let dbs = null;
  if (typeof indexedDB.databases === 'function') dbs = (await indexedDB.databases()).map(d => d.name).sort();
  return { local: keys(window.localStorage), session: keys(window.sessionStorage), dbs };
});

const visibleIn = (page, sel) => page.evaluate(q => {
  const n = document.querySelector(q);
  if (!n || n.closest('[hidden]') || !n.getClientRects().length) return false;
  const r = n.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
}, sel);

s.test('the key card lists the steps with the console link, the monthly limit, the starting preset and what Remember means, and fits 375x740 with no overflow', async h => {
  const page = await open(h, PHONE);
  await page.click('#btn-new');
  assert.ok(await page.isVisible('#create-mode-view'), 'a fresh profile is asked how to play');
  await page.click('#choose-claude');
  assert.ok(await page.isVisible('#mode-key'));
  const card = await page.evaluate(() => {
    const c = document.getElementById('mode-key');
    const a = c.querySelector('.key-steps a');
    return {
      steps: [...c.querySelectorAll('.key-steps li')].map(li => li.textContent),
      href: a && a.getAttribute('href'),
      linkText: a && a.textContent,
      target: a && a.getAttribute('target'),
      rel: a && a.getAttribute('rel'),
      text: c.textContent,
      height: c.getBoundingClientRect().height,
      display: getComputedStyle(c).display,
      align: getComputedStyle(c).textAlign
    };
  });
  assert.equal(card.steps.length, 4, 'four steps: ' + JSON.stringify(card.steps));
  assert.match(card.steps[0], /account/i);
  assert.match(card.steps[1], /credit/i);
  assert.match(card.steps[2], /monthly spend limit/i);
  assert.match(card.steps[2], /Limits/);
  assert.match(card.steps[3], /key/i);
  assert.equal(card.href, 'https://console.anthropic.com');
  assert.equal(card.linkText, 'console.anthropic.com');
  assert.equal(card.target, '_blank');
  assert.match(card.rel, /noopener/);
  assert.match(card.text, /starts on Standard/);
  assert.match(card.text, /Remember keeps the key in this browser/);
  assert.match(card.text, /other files you open from this computer could read it/, 'the privacy note stays');
  assert.match(card.text, /forgotten when this tab closes/);
  assert.equal(card.display, 'grid', 'a box, not the playing-card flex column');
  assert.ok(card.height <= PHONE.height - 40, `the card fits the screen: ${card.height}px`);
  // Scrolled to the card: the whole of it, steps to Continue, on screen at once.
  await page.evaluate(() => document.getElementById('mode-key').scrollIntoView({ block: 'start' }));
  for (const sel of ['#key-steps', '.key-steps a', '#mode-key-input', '#mode-remember', '#mode-key-go']) assert.ok(await visibleIn(page, sel), sel + ' on screen with the card');
  assert.deepEqual(await overflowReport(page, PHONE.width), []);
});

s.test('Forget key clears the key from both storages and both fields, keeps the rest, and New game asks how to play again', async h => {
  const page = await open(h, LAPTOP);
  for (const remember of [true, false]) {
    await page.evaluate(() => { Game.Storage.saveSettings({ textSize: 'L' }); Game.UI.showScreen('settings'); });
    await page.fill('#set-key', 'sk-ant-test-key-0123456789');
    if ((await page.isChecked('#set-remember')) !== remember) await page.click('#set-remember');
    const before = await page.evaluate(k => ({ local: localStorage.getItem(k), session: sessionStorage.getItem(k), key: Game.Storage.getApiKey(), mock: Game.Storage.settings().mockMode, choice: Game.Storage.settings().playChoice }), 'novatria.apiKey');
    assert.equal(before.key, 'sk-ant-test-key-0123456789');
    assert.equal(remember ? before.local : before.session, 'sk-ant-test-key-0123456789', remember ? 'remembered: localStorage' : 'this tab: sessionStorage');
    // The first time a key typed in with the demo on chose Claude (after a Forget key the demo stays as it was: off).
    if (remember) assert.equal(before.choice, 'claude', 'a key typed in chose Claude');
    // The other copy too, as an older build might have left it.
    await page.evaluate(([k, r]) => (r ? sessionStorage : localStorage).setItem(k, 'sk-ant-stale-copy'), ['novatria.apiKey', remember]);
    await page.click('#set-forget-key');
    const after = await page.evaluate(k => ({
      local: localStorage.getItem(k), session: sessionStorage.getItem(k), key: Game.Storage.getApiKey(),
      field: document.getElementById('set-key').value, modeField: document.getElementById('mode-key-input').value,
      remember: document.getElementById('set-remember').checked, saved: JSON.parse(localStorage.getItem('novatria.settings')),
      status: document.getElementById('set-forget-status').textContent
    }), 'novatria.apiKey');
    assert.deepEqual([after.local, after.session, after.key, after.field, after.modeField, after.remember], [null, null, '', '', '', false], 'gone from both storages and both fields');
    assert.equal(after.saved.playChoice, null, 'the how-to-play question is back');
    assert.equal(after.saved.rememberKey, false);
    assert.equal(after.saved.textSize, 'L', 'the other settings stay');
    assert.equal(after.status, 'Key forgotten. Your games and settings are kept.');
    // A reload finds no key either.
    await page.reload();
    await page.waitForFunction(() => window.Game && Game.App);
    assert.equal(await page.evaluate(() => Game.Storage.getApiKey()), '');
    assert.match(await page.textContent('#title-mode'), /no API key yet|Offline demo/);
    await page.click('#btn-new');
    assert.ok(await page.isVisible('#create-mode-view'), 'New game asks how to play again');
    await page.click('#mode-cancel');
  }
});

s.test('Forget key in a game keeps the autosave and the game', async h => {
  const page = await open(h, LAPTOP);
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, 'I look around');
  await page.evaluate(() => { Game.Storage.setApiKey('sk-ant-test-key-0123456789', true); Game.UI.showScreen('settings'); });
  await page.click('#set-forget-key');
  const r = await page.evaluate(() => ({ key: Game.Storage.getApiKey(), auto: Game.Storage.hasAutosave(), turn: Game.state.meta.turn, local: localStorage.getItem('novatria.apiKey') }));
  assert.deepEqual(r, { key: '', auto: true, turn: 1, local: null });
});

/* A game with everything kept: an autosave and its previous copy, a slot, a remembered key, a hand of settings, the undo store. */
async function fillEverything(page) {
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, 'I look around');
  await sendText(page, '/save First');
  await page.evaluate(() => { Game.Storage.setApiKey('sk-ant-test-key-0123456789', true); Game.Storage.saveSettings({ mockMode: true, textSize: 'L' }); sessionStorage.setItem('novatria.apiKey', 'sk-ant-other'); });
  await page.waitForTimeout(350);
  await page.evaluate(() => Game.Storage.undoIdle());
  const kept = await page.evaluate(() => Game.Storage.undoKept().then(r => !!r));
  assert.ok(kept, 'the undo store holds the game');
  const st = await stores(page);
  for (const k of ['novatria.settings', 'novatria.apiKey', 'novatria.autosave', 'novatria.slot.1']) assert.ok(st.local.includes(k), k + ' is kept before: ' + st.local.join());
  if (st.dbs) assert.ok(st.dbs.includes('novatria'), 'the undo database is listed before');
  return st;
}

for (const where of ['file', 'http']) {
  s.test(`Delete all game data (${where}://): Storage.wipeAll clears localStorage, sessionStorage and the IndexedDB database, and nothing is written after`, async h => {
    const page = where === 'http' ? await openHttp(h, LAPTOP) : await open(h, LAPTOP);
    assert.equal(await page.evaluate(() => location.protocol), where + ':');
    // Someone else's key on the same origin (every file:// page shares it) is left alone.
    await page.evaluate(() => localStorage.setItem('another-app.data', 'x'));
    await fillEverything(page);
    const r = await page.evaluate(() => Game.Storage.wipeAll());
    assert.deepEqual(r, { ok: true, left: [] });
    // A turn's worth of writing afterwards (a save, a setting, the undo stack) goes nowhere.
    await page.evaluate(() => { Game.Storage.autosave(); Game.Storage.saveSettings({ textSize: 'S' }); Game.Storage.undoFlush(); Game.Storage.holdHand({ token: 1 }); });
    await page.waitForTimeout(350);
    const st = await stores(page);
    assert.deepEqual(st.local, ['another-app.data'], 'localStorage: only what is not the game\'s');
    assert.deepEqual(st.session, [], 'sessionStorage is empty');
    if (st.dbs) assert.deepEqual(st.dbs.filter(n => n.startsWith('novatria')), [], 'no IndexedDB database of the game: ' + st.dbs.join());
    assert.equal(await page.evaluate(() => Game.Storage.getApiKey()), '');
  });

  s.test(`Delete all game data (${where}://) from Settings: asks first naming what goes, Keep it keeps everything, Delete everything lands on a fresh title screen`, async h => {
    const page = where === 'http' ? await openHttp(h, PHONE) : await open(h, PHONE);
    await fillEverything(page);
    await page.evaluate(() => Game.UI.showScreen('settings'));
    assert.match(await page.textContent('#set-device legend'), /This device/);
    await page.click('#set-wipe');
    await page.waitForSelector('#ask[open]');
    const q = await page.evaluate(() => ({ title: document.getElementById('ask-title').textContent, text: document.getElementById('ask-text').textContent, yes: document.getElementById('ask-yes').textContent, no: document.getElementById('ask-no').textContent, focus: document.activeElement.id }));
    assert.equal(q.title, 'Delete all game data on this device?');
    for (const w of ['autosave', 'previous autosave', 'save slots', 'undo history', 'settings', 'API key']) assert.ok(q.text.includes(w), 'names ' + w + ': ' + q.text);
    assert.deepEqual([q.yes, q.no, q.focus], ['Delete everything', 'Keep it', 'ask-no'], 'the safe answer has the focus');
    await page.click('#ask-no');
    const kept = await stores(page);
    assert.ok(kept.local.includes('novatria.autosave') && kept.local.includes('novatria.apiKey'), 'Keep it keeps everything');
    await page.click('#set-wipe');
    await page.waitForSelector('#ask[open]');
    await Promise.all([page.waitForEvent('load'), page.click('#ask-yes')]);
    await page.waitForFunction(() => window.Game && Game.App);
    const t = await page.evaluate(() => ({
      screen: Game.UI.screen, state: Game.state, auto: Game.Storage.hasAutosave(), key: Game.Storage.getApiKey(),
      slots: Game.Storage.listSlots().filter(Boolean).length, size: Game.Storage.settings().textSize, choice: Game.Storage.settings().playChoice,
      cont: document.getElementById('continue-group').hidden, prev: !!Game.Storage.loadPrevious()
    }));
    assert.deepEqual(t, { screen: 'title', state: null, auto: false, key: '', slots: 0, size: 'M', choice: null, cont: true, prev: false }, 'a fresh profile');
    const st = await stores(page);
    assert.deepEqual(st.local, [], 'localStorage empty after the reload');
    assert.deepEqual(st.session, [], 'sessionStorage empty after the reload');
    if (st.dbs) assert.deepEqual(st.dbs.filter(n => n.startsWith('novatria')), [], 'no IndexedDB database of the game');
    await page.click('#btn-new');
    assert.ok(await page.isVisible('#create-mode-view'), 'New game asks how to play, as on a first visit');
  });
}

s.test('a fresh profile shows no dead Continue; an autosave brings Continue back first and primary', async h => {
  for (const vp of [PHONE, LAPTOP]) {
    const page = await open(h, vp);
    const fresh = await page.evaluate(() => ({ group: document.getElementById('continue-group').hidden, btn: document.getElementById('btn-continue').getClientRects().length, newP: document.getElementById('btn-new').classList.contains('primary') }));
    assert.deepEqual(fresh, { group: true, btn: 0, newP: true }, 'nothing to continue: no Continue at ' + vp.width);
    // A damaged autosave: still no Continue, the damaged note explains.
    await page.evaluate(() => { localStorage.setItem('novatria.autosave', '{not json'); Game.UI.renderTitle(); });
    assert.deepEqual(await page.evaluate(() => [document.getElementById('continue-group').hidden, document.getElementById('title-broken').hidden]), [true, false]);
    await page.evaluate(() => { localStorage.removeItem('novatria.autosave'); Game.UI.renderTitle(); });
    await quickStart(page);
    await page.evaluate(() => Game.App.quitToTitle());
    const back = await page.evaluate(() => ({ group: document.getElementById('continue-group').hidden, on: !document.getElementById('btn-continue').disabled, primary: document.getElementById('btn-continue').classList.contains('primary'), first: document.getElementById('btn-continue').getBoundingClientRect().top < document.getElementById('btn-new').getBoundingClientRect().top }));
    assert.deepEqual(back, { group: false, on: true, primary: true, first: true });
    await page.click('#btn-continue');
    assert.equal(await page.evaluate(() => Game.UI.screen), 'game');
  }
});

s.test('the first-turn tip suggests a person here, a place next door and a thing to look at, from the opening scene, for both start places', async h => {
  const page = await open(h, LAPTOP);
  const f = await fixtures(page);
  for (const [arrival, bgIndex] of [['gate', f.gateBg], ['docks', f.docksBg]]) {
    assert.ok(bgIndex >= 0, 'a background arrives by ' + arrival);
    await page.evaluate(() => { Game.Storage.saveSettings({ tipSeen: false }); for (const t of document.querySelectorAll('.f-tip')) t.remove(); });
    await quickStart(page, { bgIndex });
    const r = await page.evaluate(() => {
      const T = Game.data.TOWN_DATA;
      const s = Game.state;
      const tip = document.querySelector('.f-tip');
      const acts = [...tip.querySelectorAll('.f-tip-try .f-tip-act')].map(a => ({ kind: a.dataset.kind, id: a.dataset.id, text: a.textContent }));
      const here = T.locations.find(l => l.id === s.player.locationId);
      const npc = id => T.npcs.find(n => n.id === id);
      const loc = id => T.locations.find(l => l.id === id);
      return { loc: s.player.locationId, start: T.startLocationIds, phase: s.time.phase, here: { exits: here.exits, schedule: here.npcIdsBySchedule[s.time.phase] || [], aka: here.aka || [], name: here.name },
        acts, people: acts.filter(a => a.kind === 'talk').map(a => { const n = npc(a.id); return n ? { name: n.name, role: n.role } : null; }), places: acts.filter(a => a.kind === 'walk').map(a => (loc(a.id) || {}).name),
        text: tip.textContent };
    });
    assert.equal(r.loc, r.start[arrival], 'starts at the ' + arrival + ' place');
    assert.ok(r.acts.length >= 2 && r.acts.length <= 3, 'two or three suggestions: ' + JSON.stringify(r.acts));
    const talk = r.acts.find(a => a.kind === 'talk');
    const walk = r.acts.find(a => a.kind === 'walk');
    const look = r.acts.find(a => a.kind === 'look');
    assert.ok(talk && walk && look, arrival + ': a person, a place and a thing: ' + JSON.stringify(r.acts));
    assert.ok(r.here.schedule.includes(talk.id), 'the person is in the scene: ' + talk.id);
    const who = r.people[0];
    const named = talk.text.includes(who.name) || talk.text.replace(/[“”]/g, '').replace(/^I talk to the /, '').split(/\s+/).every(w => who.role.toLowerCase().includes(w.toLowerCase()));
    assert.ok(named, `named by name or role: ${talk.text} (${who.name}, ${who.role})`);
    assert.ok(r.here.exits.includes(walk.id), 'the place is next door: ' + walk.id);
    assert.ok(walk.text.includes(r.places[0].replace(/^The /, 'the ')), 'by its name: ' + walk.text);
    assert.ok(r.here.aka.some(a => look.text.includes(a)) || look.text.includes(r.here.name), 'a thing at this place: ' + look.text);
    assert.match(r.text, /Do.*Say.*Wait.*⋯/s, 'the Do / Say reminder stays');
    assert.doesNotMatch(r.text, /beer/);
    await page.evaluate(() => Game.App.quitToTitle());
  }
});

s.test('phone on its side with the keyboard up: the tip is one "Tips" line that opens on a tap, the focus staying in the box; with the keyboard down it is whole', async h => {
  const LAND = { width: 740, height: 375 };
  const KB = { width: 740, height: 200 };
  const page = await open(h, LAND);
  await quickStart(page);
  assert.ok(await page.isVisible('.f-tip .f-tip-try'), 'the whole tip with the keyboard down');
  assert.equal(await page.isVisible('.f-tip .f-tip-toggle'), false, 'no Tips line with the keyboard down');
  await page.focus('#cmd');
  await page.setViewportSize(KB);
  await page.waitForFunction(() => document.getElementById('app').classList.contains('typing'));
  await page.waitForTimeout(100);
  const m = () => page.evaluate(() => {
    const tip = document.querySelector('.f-tip');
    const t = tip.getBoundingClientRect();
    return { tip: Math.round(t.height), story: Math.round(document.getElementById('feed-scroll').getBoundingClientRect().height), body: !!tip.querySelector('.f-tip-body').getClientRects().length, toggle: tip.querySelector('.f-tip-toggle').getClientRects().length ? tip.querySelector('.f-tip-toggle').textContent : null, expanded: tip.querySelector('.f-tip-toggle').getAttribute('aria-expanded'), focus: document.activeElement.id };
  });
  const shut = await m();
  assert.deepEqual([shut.body, shut.toggle, shut.expanded, shut.focus], [false, 'Tips', 'false', 'cmd'], 'one line: ' + JSON.stringify(shut));
  assert.ok(shut.tip <= 50, `the tip is one line: ${shut.tip}px`);
  assert.ok(shut.tip < shut.story / 2, `the story keeps its room: tip ${shut.tip}px of ${shut.story}px`);
  await page.click('.f-tip .f-tip-toggle');
  const opened = await m();
  assert.deepEqual([opened.body, opened.expanded, opened.focus], [true, 'true', 'cmd'], 'opened on a tap, the box keeps the focus: ' + JSON.stringify(opened));
  assert.ok(opened.tip > shut.tip);
  assert.ok(await page.evaluate(() => document.getElementById('app').classList.contains('typing')), 'still typing');
  await page.click('.f-tip .f-tip-toggle');
  const again = await m();
  assert.deepEqual([again.body, again.expanded, again.focus], [false, 'false', 'cmd'], 'and shut again');
  assert.deepEqual(await overflowReport(page, KB.width), []);
  // The keyboard down: the whole tip again.
  await page.evaluate(() => document.activeElement.blur());
  await page.setViewportSize(LAND);
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('typing'));
  const down = await m();
  assert.deepEqual([down.body, down.toggle], [true, null]);
});

(async () => {
  const server = await startServer();
  base = `http://127.0.0.1:${server.address().port}`;
  try { await s.run(); } finally { await new Promise(resolve => server.close(() => resolve())); }
})().catch(e => { console.error(e); process.exit(1); });
