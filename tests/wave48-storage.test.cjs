'use strict';
/* Wave 48: how saves and the undo stack scale (docs/notes/engine-state.md,
   Wave 48). The undo stack is kept in IndexedDB one record a step (stores
   undoHead, undoSteps, undoTowns), each town version once, so a turn writes
   one step instead of the whole stack; wave 16's single record is still
   read on load and replaced by the next write. The saves kept in
   localStorage hold their town by reference (novatria.town.<hash>, one
   copy a version, shared); an export still carries the town in full. Out
   of room: the game plays on and the feed says so once.
   Mock mode. Run with: node tests/wave48-storage.test.cjs */
const assert = require('assert/strict');
const { suite, quickStart, sendText, stateJson, LAPTOP } = require('./helpers.cjs');

const s = suite('wave48-storage');
const OUT_OF_ROOM = 'This device is out of room for saves; export your game.';
const open = (h, extra) => h.open(Object.assign({ viewport: LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const depth = page => page.evaluate(() => Game.State.undoDepth());
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });
const notices = (page, text) => page.evaluate(t => [...document.querySelectorAll('#feed .f-notice-text')].filter(n => n.textContent === t).length, text);
async function play(page, n, from) {
  const states = [await stateJson(page)];
  for (let i = 0; i < n; i++) { await sendText(page, `I look at the sign number ${(from || 0) + i + 1}`); states.push(await stateJson(page)); }
  return states;
}
/* Every write asked for is done (the timer's write, then the chain). */
async function settle(page) {
  await page.waitForTimeout(350);
  await page.evaluate(() => Game.Storage.undoIdle());
}
/* What the database holds, store by store, read beside the page. */
const stores = page => page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open('novatria');
  r.onerror = () => reject(r.error);
  r.onsuccess = () => {
    const db = r.result;
    const names = [...db.objectStoreNames];
    const out = { version: db.version, names };
    const tx = db.transaction(names, 'readonly');
    for (const n of names) { const q = tx.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; }; }
    tx.oncomplete = () => { db.close(); resolve(out); };
  };
}));
const summary = async page => {
  const x = await stores(page);
  return {
    version: x.version,
    names: x.names,
    legacy: (x.undo || []).length,
    head: x.undoHead && x.undoHead[0] ? { game: x.undoHead[0].game, ids: x.undoHead[0].ids } : null,
    steps: (x.undoSteps || []).map(e => ({ id: e.id, turn: e.turn, th: e.th, bytes: e.json.length })),
    towns: (x.undoTowns || []).map(t => ({ th: t.th, bytes: t.json.length }))
  };
};
/* Counts of the page's IndexedDB puts and deletes, by store (from now on). */
const countWrites = page => page.evaluate(() => {
  window.__w = { put: {}, del: {}, clear: {} };
  const P = IDBObjectStore.prototype;
  if (P.__wrapped) return;
  P.__wrapped = true;
  for (const [m, k] of [['put', 'put'], ['delete', 'del'], ['clear', 'clear']]) {
    const f = P[m];
    P[m] = function () { window.__w[k][this.name] = (window.__w[k][this.name] || 0) + 1; return f.apply(this, arguments); };
  }
});
async function reloadContinue(page) {
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => Game.Storage.undoIdle());
}
const lsTowns = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('novatria.town.')).sort());

// ----- the per-step layout -----

s.test('25 turns: one record a step, the oldest past UNDO_MAX deleted one by one, one town record; a turn writes one step and the head, nothing else; /undo, /redo and a reload restore the turns byte for byte', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const states = await play(page, 24);
  await settle(page);
  const max = await page.evaluate(() => Game.State.UNDO_MAX);
  assert.equal(max, 20);
  let k = await summary(page);
  assert.equal(k.version, 2);
  assert.deepEqual(k.names.slice().sort(), ['undo', 'undoHead', 'undoSteps', 'undoTowns']);
  assert.equal(k.legacy, 0, 'wave 16\'s record is not written');
  assert.equal(k.steps.length, max, 'one record a step, at most UNDO_MAX');
  assert.equal(k.towns.length, 1, 'the town once');
  assert.ok(k.steps.every(e => e.th === k.towns[0].th), 'every step names that town');
  const byId = new Map(k.steps.map(e => [e.id, e]));
  assert.deepEqual(k.head.ids.map(id => byId.get(id).turn), Array.from({ length: max }, (_, i) => 24 - max + i), 'the newest 20 turns, in order');
  assert.equal(k.head.game, await page.evaluate(() => Game.Storage.gameId(Game.state)));
  // The 25th turn: one step put, the oldest deleted, the head put; no town, no clear.
  await countWrites(page);
  states.push((await play(page, 1, 24))[1]);
  await settle(page);
  const w = await page.evaluate(() => window.__w);
  assert.deepEqual(w, { put: { undoSteps: 1, undoHead: 1 }, del: { undoSteps: 1 }, clear: {} });
  k = await summary(page);
  assert.equal(k.steps.length, max);
  assert.deepEqual(k.head.ids.map(id => k.steps.find(e => e.id === id).turn), Array.from({ length: max }, (_, i) => 25 - max + i));
  // /undo 3, /redo: exact; an undo deletes the steps it took back.
  await sendText(page, '/undo 3');
  assert.equal(await stateJson(page), states[22]);
  await sendText(page, '/redo');
  assert.equal(await stateJson(page), states[23]);
  await settle(page);
  k = await summary(page);
  assert.equal(k.steps.length, await depth(page), 'the store follows the stack');
  // A reload: the stack back, every step exact.
  await reloadContinue(page);
  assert.equal(await stateJson(page), states[23]);
  assert.equal(await depth(page), 18);
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), states[22]);
  await sendText(page, '/undo all');
  assert.equal(await stateJson(page), states[5]);
  assert.equal(await lastNotice(page), 'You took back 17 turns. Nothing more can be taken back.');
  await sendText(page, '/redo all');
  assert.equal(await stateJson(page), states[23]);
  await settle(page);
  k = await summary(page);
  assert.equal(k.steps.length, await depth(page));
  assert.equal(k.towns.length, 1);
});

s.test('the byte cap: big steps trim the oldest; the stack in memory and the one kept never pass UNDO_BYTES, and the kept one matches the stack', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  // About 1.6 MB a step (the game made heavy by hand): fewer than UNDO_MAX fit in UNDO_BYTES.
  await page.evaluate(() => { Game.state.flags.wave48Pad = 'x'.repeat(1600 * 1024); });
  await play(page, 8);
  await settle(page);
  const m = await page.evaluate(() => ({ bytes: Game.State.undoBytes(), cap: Game.State.UNDO_BYTES, depth: Game.State.undoDepth(), turns: Game.State.undoRecord().entries.map(e => e.turn) }));
  assert.ok(m.depth < 8 && m.depth >= 1, `the cap trimmed the stack (${m.depth})`);
  assert.ok(m.bytes <= m.cap, `${m.bytes} ≤ ${m.cap}`);
  assert.deepEqual(m.turns, Array.from({ length: m.depth }, (_, i) => 8 - m.depth + i), 'the oldest went first');
  const k = await summary(page);
  const kept = k.steps.reduce((a, e) => a + e.bytes, 0) + k.towns.reduce((a, t) => a + t.bytes, 0);
  assert.ok(kept <= m.cap, `kept ${kept} ≤ ${m.cap}`);
  assert.deepEqual(k.head.ids.map(id => k.steps.find(e => e.id === id).turn), m.turns);
  assert.equal(k.steps.length, m.depth, 'no step left behind');
});

s.test('wave 16\'s single-record layout (database version 1) is read on Continue: the steps come back exact, and the next write replaces it with the per-step layout', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const states = await play(page, 4);
  await settle(page);
  // The database as the older build left it: version 1, one store, one record for the game.
  await page.evaluate(() => {
    const r = Game.State.undoRecord();
    const towns = [];
    const entries = r.entries.map(e => { let t = -1; if (e.th) { const j = r.towns[e.th]; t = towns.indexOf(j); if (t < 0) t = towns.push(j) - 1; } return { turn: e.turn, json: e.json, t }; });
    window.__old = { v: 1, game: r.game, turn: r.turn, entries, towns, tab: Game.Storage.tabId, savedAt: new Date().toISOString() };
  });
  await page.evaluate(() => new Promise((resolve, reject) => {
    const del = indexedDB.deleteDatabase('novatria');
    del.onerror = () => reject(del.error);
    del.onsuccess = () => {
      const o = indexedDB.open('novatria', 1);
      o.onupgradeneeded = () => o.result.createObjectStore('undo');
      o.onsuccess = () => {
        const db = o.result;
        const tx = db.transaction('undo', 'readwrite');
        tx.objectStore('undo').put(window.__old, window.__old.game);
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    };
  }));
  await reloadContinue(page);
  assert.equal(await depth(page), 4, 'all four steps back from the old record');
  await settle(page);
  const k = await summary(page);
  assert.equal(k.version, 2, 'the database upgraded');
  assert.equal(k.legacy, 0, 'the old record replaced');
  assert.equal(k.steps.length, 4);
  assert.equal(k.towns.length, 1);
  await sendText(page, '/undo 2');
  assert.equal(await stateJson(page), states[2]);
  await reloadContinue(page);
  assert.equal(await depth(page), 2, 'and the new layout reads back');
  await sendText(page, '/undo 2');
  assert.equal(await stateJson(page), states[0]);
});

// ----- the town once -----

s.test('a change to the game\'s town copy mid-game: later steps name the new version, /undo across it brings the old copy back, the autosave and a slot name their own versions, and a version no save uses is swept', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const states = await play(page, 2);
  await sendText(page, '/save before');
  const town0 = await page.evaluate(() => JSON.stringify(Game.State.town));
  // The town copy edited as the engine tests edit it, and a person edited through the People editor's op.
  await page.evaluate(() => {
    Game.State.snapshot();
    Game.State.town.currency = { symbol: '£', name: 'pounds' };
    const n = Game.state.npcs.find(x => x.alive !== false);
    Game.State.apply({ editPerson: { npcId: n.id, attitude: 33 } }, { source: 'player' });
  });
  const town1 = await page.evaluate(() => JSON.stringify(Game.State.town));
  assert.notEqual(town1, town0);
  await play(page, 2, 2);
  await settle(page);
  const k = await summary(page);
  assert.equal(k.towns.length, 2, 'two town versions, each once');
  const th = await page.evaluate(([a, b]) => [Game.State.townHash(a), Game.State.townHash(b)], [town0, town1]);
  const order = k.head.ids.map(id => k.steps.find(e => e.id === id).th);
  assert.deepEqual(order, [th[0], th[0], th[0], th[1], th[1]], 'the steps before the edit name the old version, those after it the new');
  // localStorage: the slot keeps the old version, the autosave the new; one key each.
  assert.deepEqual(await lsTowns(page), [`novatria.town.${th[0]}`, `novatria.town.${th[1]}`].sort());
  const refs = await page.evaluate(() => ({ auto: JSON.parse(localStorage.getItem('novatria.autosave')).townRef, slot: JSON.parse(localStorage.getItem('novatria.slot.1')).townRef }));
  assert.deepEqual(refs, { auto: th[1], slot: th[0] });
  assert.equal(await page.evaluate(() => JSON.stringify(Game.Storage.loadAutosave().town)), town1, 'the autosave\'s town is the edited one');
  assert.equal(await page.evaluate(() => JSON.stringify(Game.Storage.loadSlot(1).town)), town0, 'the slot\'s is the one it was saved with');
  // /undo across the edit: the old town copy is back.
  await sendText(page, '/undo 3');
  assert.equal(await stateJson(page), states[2]);
  assert.equal(await page.evaluate(() => JSON.stringify(Game.State.town)), town0);
  // After a reload, the steps still name their versions.
  await sendText(page, '/redo 3');
  assert.equal(await page.evaluate(() => JSON.stringify(Game.State.town)), town1);
  await reloadContinue(page);
  await sendText(page, '/undo 3');
  assert.equal(await page.evaluate(() => JSON.stringify(Game.State.town)), town0);
  await sendText(page, '/redo 3');
  // The slot gone: its town version is swept once no save names it.
  await page.evaluate(() => Game.Storage.deleteSlot(1));
  assert.deepEqual(await lsTowns(page), [`novatria.town.${th[1]}`]);
});

s.test('saves kept here: the town once for the autosave and every slot of the same town, each save about half its old size; an old save with its town inline still loads and is rewritten by reference', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await play(page, 2);
  await sendText(page, '/save one');
  await sendText(page, '/save two');
  const ls = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('novatria.'));
    const size = k => (localStorage.getItem(k) || '').length;
    return { towns: keys.filter(k => k.startsWith('novatria.town.')).length, auto: size('novatria.autosave'), slot: size('novatria.slot.1'), town: JSON.stringify(Game.State.town).length, full: Game.Storage.exportJson().length,
      inline: ['novatria.autosave', 'novatria.slot.1', 'novatria.slot.2'].map(k => Object.keys(JSON.parse(localStorage.getItem(k)))) };
  });
  assert.equal(ls.towns, 1, 'one town copy for three saves');
  for (const keys of ls.inline) assert.deepEqual(keys, ['kind', 'saveVersion', 'name', 'savedAt', 'summary', 'townRef', 'state']);
  assert.ok(ls.auto < ls.full - ls.town + 200, `the autosave is the export less its town (${ls.auto} of ${ls.full})`);
  assert.ok(ls.slot < ls.full * 0.6, 'about half');
  // An old autosave (town inline, as every save before wave 48) still loads.
  await page.evaluate(() => { const env = JSON.parse(Game.Storage.exportJson()); env.name = 'Autosave'; localStorage.setItem('novatria.autosave', JSON.stringify(env)); });
  const s0 = await stateJson(page);
  await reloadContinue(page);
  assert.equal(await stateJson(page), s0);
  await sendText(page, 'I look around');
  assert.deepEqual(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('novatria.autosave')))), ['kind', 'saveVersion', 'name', 'savedAt', 'summary', 'townRef', 'state'], 'written by reference from then on');
  // A save whose town copy is gone is damaged (said, never played on the wrong town); an import without its town falls back as before.
  const r = await page.evaluate(() => {
    const raw = localStorage.getItem('novatria.slot.1');
    const ref = JSON.parse(raw).townRef;
    const t = localStorage.getItem('novatria.town.' + ref);
    localStorage.removeItem('novatria.town.' + ref);
    const out = { slot: Game.Storage.peek('novatria.slot.1') };
    try { out.file = !!Game.Storage.parseEnvelope(raw).town; } catch (e) { out.file = e.message; }
    localStorage.setItem('novatria.town.' + ref, t);
    out.back = !!Game.Storage.loadSlot(1);
    return out;
  });
  assert.deepEqual(r.slot, { broken: true, error: 'The saved game is damaged: its copy of the town is missing' });
  assert.equal(r.file, true);
  assert.equal(r.back, true);
});

s.test('export and import round-trip byte for byte on the documented fields: the export carries the full town and no townRef, and an import exports the same state and town again', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await play(page, 3);
  const a = await page.evaluate(() => {
    const env = JSON.parse(Game.Storage.exportJson());
    return { keys: Object.keys(env), kind: env.kind, saveVersion: env.saveVersion, state: JSON.stringify(env.state), town: JSON.stringify(env.town), live: JSON.stringify(Game.state), liveTown: JSON.stringify(Game.State.town), summary: env.summary, text: Game.Storage.exportJson() };
  });
  assert.deepEqual(a.keys, ['kind', 'saveVersion', 'name', 'savedAt', 'summary', 'state', 'town']);
  assert.equal(a.kind, 'novatria-save');
  assert.equal(a.saveVersion, 1);
  assert.equal(a.state, a.live);
  assert.equal(a.town, a.liveTown);
  // Import it in a fresh browser (another device): the same game and town, and its export the same again.
  const other = await open(h);
  await fast(other);
  await other.click('#btn-load');
  await other.setInputFiles('#import-file', { name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(a.text) });
  await other.waitForSelector('#screen-game.active');
  await other.waitForFunction(() => !Game.Pipeline.busy);
  const b = await other.evaluate(() => { const env = JSON.parse(Game.Storage.exportJson()); return { keys: Object.keys(env), state: JSON.stringify(env.state), town: JSON.stringify(env.town), summary: env.summary }; });
  assert.deepEqual(b.keys, a.keys);
  assert.equal(b.state, a.state, 'the state byte for byte');
  assert.equal(b.town, a.town, 'the town byte for byte');
  assert.deepEqual(b.summary, a.summary);
  // And it is kept here by reference, the same town version.
  const ref = await other.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave')).townRef);
  assert.equal(ref, await other.evaluate(t => Game.State.townHash(t), a.town));
});

// ----- out of room -----

s.test('out of room in localStorage: the game plays on, the feed says so once, and the previous autosave goes to keep the autosave; nothing written at all still plays', async h => {
  const page = await open(h);
  await quickStart(page, { seed: 4242 });
  await fast(page);
  await play(page, 1);
  // Another game: the first is kept as the previous autosave.
  await quickStart(page, { seed: 777 });
  await fast(page);
  await play(page, 1);
  assert.ok(await page.evaluate(() => !!localStorage.getItem('novatria.autosave.prev')));
  // A quota just under what is stored now: the next autosave only fits once the previous one goes.
  await page.evaluate(() => {
    const P = window.Storage.prototype;
    const set = P.setItem;
    const used = () => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return n; };
    window.__limit = used() - 100;
    P.setItem = function (k, v) {
      if (this === window.localStorage) {
        const was = this.getItem(k);
        if (used() - (was === null ? 0 : k.length + was.length) + k.length + String(v).length > window.__limit) throw new DOMException('full', 'QuotaExceededError');
      }
      return set.call(this, k, v);
    };
  });
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  await sendText(page, 'I look around');
  const r = await page.evaluate(() => ({ turn: Game.state.meta.turn, prev: localStorage.getItem('novatria.autosave.prev'), saved: JSON.parse(localStorage.getItem('novatria.autosave')).state.meta.turn }));
  assert.equal(r.turn, t0 + 1, 'the turn played');
  assert.equal(r.prev, null, 'the previous autosave went');
  assert.equal(r.saved, r.turn, 'the autosave holds this turn');
  assert.equal(await notices(page, OUT_OF_ROOM), 1);
  // No room at all: turns still play, the notice is not said again.
  await page.evaluate(() => { window.__limit = 0; });
  await play(page, 2, 5);
  assert.equal(await page.evaluate(() => Game.state.meta.turn), t0 + 3);
  assert.equal(await notices(page, OUT_OF_ROOM), 1, 'said once');
  assert.ok(await page.isVisible('#banner'));
  assert.match(await page.textContent('#banner-text'), /Saving failed/);
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), t0 + 2, '/undo still works');
});

s.test('out of room in IndexedDB: the game plays on, the feed says so once, and once there is room again the whole stack is written', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await play(page, 2);
  await settle(page);
  await page.evaluate(() => {
    const P = IDBObjectStore.prototype;
    window.__put = P.put;
    P.put = function () { throw new DOMException('full', 'QuotaExceededError'); };
  });
  const states = await play(page, 2, 2);
  await settle(page);
  assert.equal(await notices(page, OUT_OF_ROOM), 1);
  await play(page, 1, 4);
  await settle(page);
  assert.equal(await notices(page, OUT_OF_ROOM), 1, 'said once');
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), states[2], '/undo still exact');
  // Room again: the next write puts the whole stack.
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__put; });
  await play(page, 1, 9);
  await settle(page);
  const k = await summary(page);
  assert.equal(k.steps.length, await depth(page));
  assert.equal(k.head.ids.length, k.steps.length);
  await reloadContinue(page);
  assert.equal(await depth(page), k.steps.length);
});

s.run();
