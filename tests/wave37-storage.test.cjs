'use strict';
/* Wave 37, Creator Mode, milestone 2 (task M2-B): Storage learns story
   packs. Envelopes are saveVersion 2 and name their pack (packRef: id,
   version, hash); an export carries the pack in full, a local save of the
   built-in pack carries the reference only; parseEnvelope reads versions 1
   and 2 and hands back the pack each save plays (Storage.resolvePack, plan
   decision C), or packMissing when this device does not have it; the
   Library keeps the packs on this device (IndexedDB "packs", read into
   memory at boot); the database is version 2 with the stores undo, packs,
   drafts and frozen, and a version-1 database keeps its undo record; the
   frozen copy of a pack a save names is kept once and swept when no save
   names it; without IndexedDB the Library lives in memory and a local
   envelope of a pack that is not the built-in one carries the pack. The
   owner: "a save keeps playing the same way even if the pack is edited or
   deleted later".
   Until milestone 2's State lands, State.pack does not exist in this
   build; the tests set it the way the build at hand allows (usePack).
   Run with: node tests/run.cjs wave37-storage */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave37-storage');

/* A game, the Library loaded, the mock with no delay. */
async function start(h, opts) {
  const page = await h.open(opts);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await page.evaluate(() => Game.Storage.Library.ready);
  await quickStart(page);
  await page.waitForFunction(() => !Game.Pipeline.busy);
  return page;
}
/* In the page: a copy of the built-in pack under another id ("a renamed
   copy"), so its hash differs; and a way to make it the running game's pack
   in either build (before milestone 2's State, State.pack is a plain
   property; after it, State.load takes the pack). */
const PAGE_HELPERS = () => {
  window.__w37 = {
    renamed(id, title) {
      const p = Game.Pack.copy(Game.Pack.builtIn());
      p.meta.id = id || 'river-copy';
      p.meta.title = title || 'River Copy';
      return p;
    },
    usePack(pack) {
      const S = Game.State;
      const d = Object.getOwnPropertyDescriptor(S, 'pack');
      if (d && d.get) S.load(JSON.parse(JSON.stringify(Game.state)), S.town, pack);
      else S.pack = pack;
    },
    frozenKeys() { return Game.Storage.tx('frozen', 'readonly', store => store.getAllKeys()); }
  };
};
const helpers = page => page.evaluate(PAGE_HELPERS);

s.test('a local envelope is saveVersion 2 and names the built-in pack by id, version and hash, with no pack in it; its summary names the pack\'s title and rating; an export carries the pack in full, and reading the export back gives the built-in pack itself', async h => {
  const page = await start(h);
  const r = await page.evaluate(() => {
    const St = Game.Storage;
    const b = Game.Pack.builtIn();
    const env = St.envelope('x');
    const file = St.envelope('x', { forFile: true });
    const text = St.serialise(file);
    const back = St.parseEnvelope(text);
    const exported = JSON.parse(St.exportJson());
    return {
      version: env.saveVersion, ref: env.packRef, hasPack: 'pack' in env, summary: [env.summary.packTitle, env.summary.packRating],
      want: { id: b.meta.id, version: b.meta.version, hash: Game.Pack.hash(b) },
      fileVersion: file.saveVersion, fileRef: file.packRef, fileId: JSON.parse(text).pack.meta.id, fileHash: Game.Pack.hash(JSON.parse(text).pack),
      backIsBuiltIn: back.pack === b, backWarn: back.packWarning || null, backMissing: back.packMissing || null,
      exportId: exported.pack && exported.pack.meta.id
    };
  });
  assert.equal(r.version, 2);
  assert.deepEqual(r.ref, r.want);
  assert.equal(r.hasPack, false, 'a local envelope of the built-in pack carries the reference only');
  assert.deepEqual(r.summary, ['Low Water', 'adult']);
  assert.equal(r.fileVersion, 2);
  assert.deepEqual(r.fileRef, r.want);
  assert.equal(r.fileId, 'low-water');
  assert.equal(r.fileHash, r.want.hash, 'the pack in the file is the built-in pack, unchanged');
  assert.equal(r.backIsBuiltIn, true);
  assert.equal(r.backWarn, null);
  assert.equal(r.backMissing, null);
  assert.equal(r.exportId, 'low-water', 'exportJson (Save / Load\'s Export) carries the pack');
});

s.test('the autosave and a slot of a built-in game are saveVersion 2 with a packRef and no pack, and Continue\'s envelope comes back with the built-in pack', async h => {
  const page = await start(h);
  const r = await page.evaluate(() => {
    const St = Game.Storage;
    St.autosave();
    St.saveSlot(1, 'One');
    const raw = [localStorage.getItem(St.KEYS.autosave), localStorage.getItem(St.KEYS.slot(1))].map(t => JSON.parse(t));
    const auto = St.loadAutosave();
    const slot = St.loadSlot(1);
    return {
      stored: raw.map(e => [e.saveVersion, !!e.packRef, 'pack' in e]),
      packs: [auto.pack === Game.Pack.builtIn(), slot.pack === Game.Pack.builtIn()]
    };
  });
  assert.deepEqual(r.stored, [[2, true, false], [2, true, false]]);
  assert.deepEqual(r.packs, [true, true]);
});

s.test('a saveVersion 1 envelope (no packRef) still reads and plays the built-in pack, with its town and with no town at all', async h => {
  const page = await start(h);
  const r = await page.evaluate(() => {
    const St = Game.Storage;
    const v1 = St.envelope('old');
    delete v1.packRef;
    v1.saveVersion = 1;
    delete v1.summary.packTitle;
    delete v1.summary.packRating;
    const a = St.parseEnvelope(JSON.stringify(v1));
    const bare = JSON.parse(JSON.stringify(v1));
    delete bare.town;
    const b = St.parseEnvelope(JSON.stringify(bare));
    // A bare state (the oldest exports) is wrapped as version 1.
    const c = St.parseEnvelope(JSON.stringify(Game.state));
    const B = Game.Pack.builtIn();
    return [a.pack === B, b.pack === B, c.pack === B, !!(a.packMissing || b.packMissing || c.packMissing), b.town.name === B.world.name];
  });
  assert.deepEqual(r, [true, true, true, false, true]);
});

s.test('a saveVersion 2 envelope of a pack this device does not have (an unknown id, a hash that is not the built-in pack\'s) reads with packMissing naming the pack, and importFile refuses it with that text; a newer saveVersion and an unreadable packRef are refused', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const St = Game.Storage;
    const env = St.envelope('x');
    env.packRef = { id: 'far-shore', version: '2.0.0', hash: '0123456789abcdef' };
    env.summary.packTitle = 'Far Shore';
    const text = JSON.stringify(env);
    const read = St.parseEnvelope(text);
    let imported = null;
    try { await St.importFile(new File([text], 'far-shore.json', { type: 'application/json' })); } catch (e) { imported = e.message; }
    const refusal = mutate => { const e = JSON.parse(text); mutate(e); try { St.parseEnvelope(JSON.stringify(e)); return null; } catch (x) { return x.message; } };
    return {
      pack: read.pack, missing: read.packMissing, imported,
      newer: refusal(e => { e.saveVersion = 3; }),
      badRef: refusal(e => { e.packRef = { id: 'far-shore', hash: 'nope' }; }),
      badPack: refusal(e => { e.pack = { packFormat: 1, meta: {} }; })
    };
  });
  const want = 'This save needs the story pack Far Shore (far-shore), which is not on this device. Import the save\'s export file instead.';
  assert.equal(r.pack, null);
  assert.equal(r.missing, want);
  assert.equal(r.imported, want);
  assert.equal(r.newer, 'That file was saved by a newer version of the game.');
  assert.equal(r.badRef, 'That save is damaged: its story pack reference is not readable.');
  assert.equal(r.badPack, 'That save is damaged: the story pack it carries is not readable.');
});

s.test('an export of a renamed copy of the built-in pack, read through importFile, adds the pack to the Library as from-save, plays from it, keeps its frozen copy by hash; a local envelope of it then resolves from the frozen copy, and one whose hash the device has never seen plays the Library copy with packWarning', async h => {
  const page = await start(h);
  await helpers(page);
  const r = await page.evaluate(async () => {
    const St = Game.Storage;
    const copy = window.__w37.renamed();
    const hash = Game.Pack.hash(copy);
    const env = St.envelope('Export', { forFile: true });
    env.pack = copy;
    env.packRef = { id: copy.meta.id, version: copy.meta.version, hash };
    env.summary.packTitle = copy.meta.title;
    const text = St.serialise(env);
    const before = St.Library.get('river-copy');
    const got = await St.importFile(new File([text], 'river.json', { type: 'application/json' }));
    const rec = St.Library.get('river-copy');
    await St.undoIdle();
    const keys = await window.__w37.frozenKeys();
    // The same save without the pack (as a local save keeps it): the frozen copy answers, exactly.
    const local = JSON.parse(text);
    delete local.pack;
    const fromFrozen = St.parseEnvelope(JSON.stringify(local), 'The saved game');
    // A hash the device never kept: the Library's pack of that id, with the warning.
    const edited = JSON.parse(text);
    delete edited.pack;
    edited.packRef.hash = 'fedcba9876543210';
    const fromLibrary = St.parseEnvelope(JSON.stringify(edited), 'The saved game');
    return {
      before, id: got.pack.meta.id, frozen: Object.isFrozen(got.pack), gotHash: Game.Pack.hash(got.pack), hash,
      rec: rec && [rec.id, rec.source, rec.title, rec.hash], missing: got.packMissing || null,
      kept: keys.includes(hash),
      frozenHash: fromFrozen.pack && Game.Pack.hash(fromFrozen.pack), frozenWarn: fromFrozen.packWarning || null,
      libId: fromLibrary.pack && fromLibrary.pack.meta.id, libWarn: fromLibrary.packWarning || null
    };
  });
  assert.equal(r.before, null, 'not in the Library before');
  assert.equal(r.id, 'river-copy');
  assert.equal(r.frozen, true);
  assert.equal(r.gotHash, r.hash);
  assert.equal(r.missing, null);
  assert.deepEqual(r.rec, ['river-copy', 'from-save', 'River Copy', r.hash]);
  assert.equal(r.kept, true, 'the frozen copy is in IndexedDB under its hash');
  assert.equal(r.frozenHash, r.hash);
  assert.equal(r.frozenWarn, null);
  assert.equal(r.libId, 'river-copy');
  assert.equal(r.libWarn, 'The story pack changed since this save; it plays with the pack you have now.');
});

s.test('Library: the built-in pack is a made-up record that is never stored; put, get, index, duplicate, exportText, importText and remove round-trip a pack through IndexedDB and a reload; a pack with a validation error, the built-in id, a saved game and broken JSON are refused', async h => {
  const page = await start(h);
  await helpers(page);
  const r = await page.evaluate(async () => {
    const L = Game.Storage.Library;
    const P = Game.Pack;
    const err = f => { try { f(); return null; } catch (e) { return e.message; } };
    const b = L.get('low-water');
    const copy = window.__w37.renamed();
    const put = L.put(copy, { source: 'created' });
    const got = L.get('river-copy');
    const dup = L.duplicate('river-copy');
    const dup2 = L.duplicate(copy, 'river-three');
    const text = L.exportText('river-copy');
    const removed = L.remove('river-copy');
    const afterRemove = L.get('river-copy');
    const back = L.importText(text);
    const broken = window.__w37.renamed('river-broken');
    broken.world.locations[0].exits = broken.world.locations[0].exits.concat(['loc_nowhere']);
    const save = Game.Storage.exportJson();
    await Game.Storage.undoIdle();
    return {
      builtIn: [b.id, b.source, b.pack === P.builtIn(), b.hash === P.hash(P.builtIn()), b.title],
      put: [put.id, put.source, put.title, put.author, put.version, put.rating, put.hash === P.hash(copy), typeof put.savedAt, put.playedAt],
      gotFrozen: Object.isFrozen(got.pack), notSame: got.pack !== copy,
      dup: [dup.id, dup.source, dup.title, dup.pack.meta.id], dup2: [dup2.id, dup2.source],
      text: text === P.format(copy), removed, afterRemove, removeBuiltIn: L.remove('low-water'),
      back: [back.id, back.source, back.hash === put.hash],
      index: L.index().map(x => x.id),
      refusals: {
        invalid: err(() => L.put(broken)),
        builtInId: err(() => L.put(P.copy(P.builtIn()))),
        save: err(() => L.importText(save)),
        json: err(() => L.importText('{ nope')),
        format: err(() => L.importText(JSON.stringify({ packFormat: 9, meta: { id: 'x' } }))),
        notPack: err(() => L.importText('[1, 2]')),
        dupTaken: err(() => L.duplicate('river-copy', 'river-three')),
        none: err(() => L.exportText('no-such-pack'))
      },
      persistent: L.persistent
    };
  });
  assert.deepEqual(r.builtIn, ['low-water', 'built-in', true, true, 'Low Water']);
  assert.deepEqual(r.put, ['river-copy', 'created', 'River Copy', 'Joe', '1.0.0', 'adult', true, 'string', null]);
  assert.equal(r.gotFrozen, true, 'the Library\'s pack is frozen');
  assert.equal(r.notSame, true, 'the Library keeps its own copy');
  assert.deepEqual(r.dup, ['river-copy-2', 'duplicate', 'River Copy (copy)', 'river-copy-2']);
  assert.deepEqual(r.dup2, ['river-three', 'duplicate']);
  assert.equal(r.text, true, 'exportText is Pack.format of the pack');
  assert.equal(r.removed, true);
  assert.equal(r.afterRemove, null);
  assert.equal(r.removeBuiltIn, false, 'the built-in story cannot be removed');
  assert.deepEqual(r.back, ['river-copy', 'import', true]);
  assert.deepEqual(r.index, ['low-water', 'river-copy', 'river-copy-2', 'river-three'], 'the built-in pack first, then by title');
  assert.match(r.refusals.invalid, /^That story pack has a problem at world\.locations\[0\]\.exits\[\d+\]: /);
  assert.equal(r.refusals.builtInId, 'The id low-water is the built-in story\'s. Give the pack an id of its own.');
  assert.equal(r.refusals.save, 'That file is a saved game, not a story pack. Import it from Save / Load.');
  assert.equal(r.refusals.json, 'That file is not valid JSON.');
  assert.equal(r.refusals.format, 'That story pack was made for a newer version of the game.');
  assert.equal(r.refusals.notPack, 'That file is not a story pack.');
  assert.equal(r.refusals.dupTaken, 'There is already a story pack with the id river-three.');
  assert.equal(r.refusals.none, 'There is no such story pack.');
  assert.equal(r.persistent, true);
  // Through a reload: the records come back from IndexedDB, the built-in pack is still not among them.
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  const after = await page.evaluate(async () => {
    await Game.Storage.Library.ready;
    const L = Game.Storage.Library;
    const stored = await Game.Storage.tx('packs', 'readonly', store => store.getAllKeys());
    const rec = L.get('river-copy');
    return { index: L.index().map(x => [x.id, x.source]), stored, hashOk: rec.hash === Game.Pack.hash(rec.pack), frozen: Object.isFrozen(rec.pack) };
  });
  assert.deepEqual(after.index, [['low-water', 'built-in'], ['river-copy', 'import'], ['river-copy-2', 'duplicate'], ['river-three', 'duplicate']]);
  assert.deepEqual(after.stored.slice().sort(), ['river-copy', 'river-copy-2', 'river-three']);
  assert.equal(after.hashOk, true);
  assert.equal(after.frozen, true);
});

s.test('settings gain selectedPackId (the built-in pack by default; a pack id as the format spells one, else the default) and developerMode (false), with no settings version bump; a settings object from before has the defaults', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const St = Game.Storage;
    const d = St.settings();
    const first = [d.selectedPackId, d.developerMode, d.settingsVersion];
    St.saveSettings({ selectedPackId: 'river-copy', developerMode: true });
    const set = [St.settings().selectedPackId, St.settings().developerMode];
    St.saveSettings({ selectedPackId: 'River Copy!', developerMode: 'yes' });
    const kept = [St.settings().selectedPackId, St.settings().developerMode];
    St.saveSettings({ selectedPackId: 42 });
    return { first, set, kept, again: St.settings().selectedPackId, defaults: [St.DEFAULTS.selectedPackId, St.DEFAULTS.developerMode], stored: JSON.parse(localStorage.getItem(St.KEYS.settings)).selectedPackId };
  });
  assert.deepEqual(r.first, ['low-water', false, 2]);
  assert.deepEqual(r.set, ['river-copy', true]);
  // cleanSettings treats a bad value as it treats every field: dropped, so the default stands.
  assert.deepEqual(r.kept, ['low-water', false], 'a malformed id and a non-boolean developerMode give the defaults');
  assert.equal(r.again, 'low-water');
  assert.deepEqual(r.defaults, ['low-water', false]);
  assert.equal(r.stored, 'low-water');
});

s.test('IndexedDB version 2 keeps a version-1 database\'s undo record and adds the stores packs, drafts and frozen', async h => {
  const page = await h.open();
  // Put back the database an older build made: version 1, the undo store only, one record (the game's own connection closes on versionchange).
  await page.evaluate(() => new Promise((resolve, reject) => {
    const del = indexedDB.deleteDatabase('novatria');
    del.onerror = () => reject(new Error('delete failed'));
    del.onsuccess = () => {
      const req = indexedDB.open('novatria', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('undo');
      req.onsuccess = () => {
        const db = req.result;
        const t = db.transaction('undo', 'readwrite');
        t.objectStore('undo').put({ game: 'old|1', entries: [], towns: [], tab: 't0' }, 'old|1');
        t.oncomplete = () => { db.close(); resolve(); };
        t.onerror = () => reject(new Error('write failed'));
      };
      req.onerror = () => reject(new Error('open failed'));
    };
  }));
  const v1 = await page.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open('novatria');
    req.onsuccess = () => { const db = req.result; const out = { version: db.version, stores: Array.from(db.objectStoreNames) }; db.close(); resolve(out); };
  }));
  assert.deepEqual(v1, { version: 1, stores: ['undo'] }, 'the old database is in place');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  const r = await page.evaluate(async () => {
    await Game.Storage.Library.ready;
    const kept = await Game.Storage.undoKept();
    const db = await Game.Storage.openDb();
    return { version: db.version, stores: Array.from(db.objectStoreNames).sort(), kept: kept && kept.game, persistent: Game.Storage.Library.persistent };
  });
  assert.deepEqual(r, { version: 2, stores: ['drafts', 'frozen', 'packs', 'undo'], kept: 'old|1', persistent: true });
});

s.test('a local save of a pack that is not the built-in one keeps the pack out of localStorage and its frozen copy in IndexedDB, once; it loads back from the frozen copy after a reload; the boot sweep deletes a frozen copy no save names (once it is old) and never one a save names', async h => {
  const page = await start(h);
  await helpers(page);
  const hash = await page.evaluate(async () => {
    const copy = Game.Pack.deepFreeze(window.__w37.renamed());
    window.__w37.usePack(copy);
    Game.Storage.autosave();
    Game.Storage.saveSlot(2, 'River');
    await Game.Storage.undoIdle();
    return Game.Pack.hash(copy);
  });
  const r = await page.evaluate(async h => {
    const St = Game.Storage;
    const raw = JSON.parse(localStorage.getItem(St.KEYS.autosave));
    const slot = JSON.parse(localStorage.getItem(St.KEYS.slot(2)));
    // A stale copy no save names, written as an old one would have been.
    const stale = window.__w37.renamed('stale-copy', 'Stale');
    const staleHash = Game.Pack.hash(stale);
    await St.tx('frozen', 'readwrite', store => store.put({ hash: staleHash, pack: stale, savedAt: '2020-01-01T00:00:00.000Z' }));
    // And a new one no save names yet (an import whose game is not loaded): the grace keeps it.
    const fresh = window.__w37.renamed('fresh-copy', 'Fresh');
    const freshHash = Game.Pack.hash(fresh);
    await St.tx('frozen', 'readwrite', store => store.put({ hash: freshHash, pack: fresh, savedAt: new Date().toISOString() }));
    return { autoPack: 'pack' in raw, slotPack: 'pack' in slot, refs: [raw.packRef.hash, slot.packRef.hash], keys: (await window.__w37.frozenKeys()).length, staleHash, freshHash };
  }, hash);
  assert.equal(r.autoPack, false, 'the autosave carries the reference only');
  assert.equal(r.slotPack, false, 'the slot carries the reference only');
  assert.deepEqual(r.refs, [hash, hash]);
  assert.equal(r.keys, 3, 'one frozen copy for both saves, and the two written by hand');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await helpers(page);
  const after = await page.evaluate(async () => {
    await Game.Storage.Library.ready;
    await Game.Storage.undoIdle();
    const auto = Game.Storage.loadAutosave();
    const slot = Game.Storage.loadSlot(2);
    return { keys: (await window.__w37.frozenKeys()).sort(), auto: [auto.pack && auto.pack.meta.id, auto.packWarning || null, auto.packMissing || null], slot: slot.pack && slot.pack.meta.id };
  });
  assert.deepEqual(after.keys, [hash, r.freshHash].sort(), 'the stale copy is swept; the one the saves name and the new one stay');
  assert.deepEqual(after.auto, ['river-copy', null, null]);
  assert.equal(after.slot, 'river-copy');
});

s.test('without IndexedDB (as in some private windows) the Library works in memory for the page, says it is not persistent, and a local envelope of a pack that is not the built-in one carries the pack; one of the built-in pack still carries the reference only', async h => {
  const page = await h.open();
  await page.context().addInitScript(() => { try { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); }, configurable: true }); } catch (e) { /* fine */ } });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page);
  await page.waitForFunction(() => !Game.Pipeline.busy);
  await helpers(page);
  const r = await page.evaluate(async () => {
    const St = Game.Storage;
    const L = St.Library;
    await L.ready;
    const builtInEnv = St.envelope('x');
    const rec = L.put(window.__w37.renamed(), { source: 'created' });
    const copy = L.get('river-copy').pack;
    window.__w37.usePack(copy);
    const env = St.envelope('x');
    const ok = St.autosave();
    const stored = JSON.parse(localStorage.getItem(St.KEYS.autosave));
    const back = St.loadAutosave();
    return {
      persistent: L.persistent, rec: [rec.id, rec.source], index: L.index().map(x => x.id),
      builtInPack: 'pack' in builtInEnv, envPack: env.pack && env.pack.meta.id, ok, storedPack: stored.pack && stored.pack.meta.id,
      back: back.pack && back.pack.meta.id, db: await St.openDb(), kept: await St.undoKept()
    };
  });
  assert.equal(r.persistent, false);
  assert.deepEqual(r.rec, ['river-copy', 'created']);
  assert.deepEqual(r.index, ['low-water', 'river-copy']);
  assert.equal(r.builtInPack, false);
  assert.equal(r.envPack, 'river-copy');
  assert.equal(r.ok, true);
  assert.equal(r.storedPack, 'river-copy', 'the autosave in localStorage carries the pack');
  assert.equal(r.back, 'river-copy');
  assert.equal(r.db, null);
  assert.equal(r.kept, null);
  assert.equal(await page.isHidden('#banner'), true, 'no warning');
});

s.run();
