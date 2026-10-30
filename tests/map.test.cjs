'use strict';
/* The town map at the top of the Places tab (UI.renderMap, docs/BUILD_PLAN.md
   "Map"): every discovered place with its short label, the player's place
   ringed, one road per pair of connected places and none through the river,
   closed places struck, people the player has met beside where they were
   last seen, and tap-to-travel: a tap on another place asks "Go to ...?"
   and only the chip spends a turn. Phone size, both themes, and a town
   without map data. Ids and names come from the running game, never from
   one particular town. Run with: node tests/run.cjs map */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { suite, quickStart, sendText, overflowReport, findScene, place, ROOT, GAME_PATH, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('map');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });

async function openPlaces(page) {
  if (await page.evaluate(() => window.innerWidth < 900)) {
    await page.click('[data-open-tab="places"]');
    await page.waitForTimeout(320);
  } else await page.click('#tab-places');
  await page.waitForSelector('.map-svg');
}
/* Tap a place the way a player does: on its marker. The current place is
   aria-disabled, so Playwright needs force to click it at all. */
const tapPlace = (page, id, force) => page.click(`.map-place[data-loc="${id}"] .map-mark`, { force: !!force });
/* What the map shows, read from the page. */
function readMap(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.map-svg');
    const places = [...svg.querySelectorAll('.map-place')].map(g => ({
      id: g.dataset.loc, here: g.dataset.here === '1', closed: g.dataset.closed === '1', glyph: g.dataset.glyph,
      label: [...g.querySelectorAll('.map-label')].map(t => t.textContent).join(' '),
      caption: [...g.querySelectorAll('.map-caption')].map(t => t.textContent).join(' '),
      ring: !!g.querySelector('.map-ring'), strike: !!g.querySelector('.map-strike'), struck: !!g.querySelector('.map-label.struck'),
      people: [...g.querySelectorAll('.map-mono')].map(m => ({ id: m.dataset.npc, hue: m.dataset.hue, text: m.querySelector('text').textContent })),
      more: (g.querySelector('.map-more') || {}).textContent || '', aria: g.getAttribute('aria-label'), role: g.getAttribute('role'), tabindex: g.getAttribute('tabindex')
    }));
    return { places, roads: [...svg.querySelectorAll('.map-road:not(.deco)')].map(p => p.dataset.road), chip: (document.querySelector('.map-go') || {}).textContent || null };
  });
}
/* The labels a test expects: the town data's map label, else the name without "The". */
function expectedLabels(page) {
  return page.evaluate(() => {
    const out = {};
    for (const l of Game.state.locations) {
      const t = Game.town.locations.find(x => x.id === l.id);
      out[l.id] = (l.map && l.map.label) || (t && t.map && t.map.label) || l.name.replace(/^The /, '');
    }
    return out;
  });
}

s.test('the map shows every discovered place with its label, rings the current place, draws one road per connected pair and keeps the roads out of the river', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await openPlaces(page);
  const m = await readMap(page);
  const st = await page.evaluate(() => Game.state);
  const labels = await expectedLabels(page);
  const discovered = st.locations.filter(l => l.discovered);
  assert.deepEqual(m.places.map(p => p.id).sort(), discovered.map(l => l.id).sort(), 'one marker per discovered place');
  for (const p of m.places) {
    assert.equal(p.label, labels[p.id], 'label of ' + p.id);
    assert.equal(p.role, 'button');
    assert.equal(p.tabindex, '0');
    assert.ok(p.aria.startsWith(st.locations.find(l => l.id === p.id).name), 'aria-label names ' + p.id);
  }
  const here = m.places.filter(p => p.ring);
  assert.deepEqual(here.map(p => p.id), [st.player.locationId], 'only the current place has the ring');
  assert.ok(here[0].here && here[0].caption === 'You are here', 'and the caption');
  assert.ok(m.places.filter(p => p.caption).length === 1);
  // Roads: each pair of connected discovered places once.
  const pairs = new Set();
  for (const l of discovered) for (const x of l.exits) if (discovered.some(o => o.id === x)) pairs.add([l.id, x].sort().join('|'));
  assert.equal(m.roads.length, pairs.size, 'roads = unique exit pairs');
  assert.deepEqual(m.roads.slice().sort(), [...pairs].sort());
  // Marker glyphs hint at the type: three shapes at most.
  const glyphs = new Set(m.places.map(p => p.glyph));
  assert.ok(glyphs.size <= 3 && [...glyphs].every(g => ['house', 'square', 'wedge'].includes(g)), 'glyphs: ' + [...glyphs]);
  const typeOf = id => st.locations.find(l => l.id === id).type;
  for (const p of m.places) {
    if (['marina', 'docks'].includes(typeOf(p.id))) assert.equal(p.glyph, 'wedge', p.id);
    if (['gas', 'pawn'].includes(typeOf(p.id))) assert.equal(p.glyph, 'square', p.id);
    if (['bar', 'church', 'motel'].includes(typeOf(p.id))) assert.equal(p.glyph, 'house', p.id);
  }
  // Geometry: no road from exits enters the river, and every label is inside the map.
  const geo = await page.evaluate(() => {
    const svg = document.querySelector('.map-svg');
    const water = svg.querySelector('.map-water');
    const rw = water ? parseFloat(water.getAttribute('stroke-width')) : 0;
    const river = [];
    if (water) { const L = water.getTotalLength(); for (let i = 0; i <= 400; i++) { const q = water.getPointAtLength(L * i / 400); river.push([q.x, q.y]); } }
    const wet = [];
    for (const road of svg.querySelectorAll('.map-road:not(.deco)')) {
      const L = road.getTotalLength();
      let near = Infinity;
      for (let i = 0; i <= 60; i++) { const q = road.getPointAtLength(L * i / 60); for (const [x, y] of river) near = Math.min(near, Math.hypot(x - q.x, y - q.y)); }
      if (near < rw / 2 + 1) wet.push(`${road.dataset.road} comes within ${near.toFixed(1)} of the river's centre (half width ${rw / 2})`);
    }
    const box = svg.getBoundingClientRect();
    const out = [...svg.querySelectorAll('text')].filter(t => { const r = t.getBoundingClientRect(); return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5; }).map(t => t.textContent);
    return { river: river.length > 0, bridge: !!svg.querySelector('.map-bridge'), wet, out, riverLabel: (svg.querySelector('.map-river-label') || {}).textContent || '' };
  });
  if (geo.river) {
    assert.deepEqual(geo.wet, [], 'roads only cross the river at the bridge');
    assert.ok(geo.bridge, 'the bridge is drawn');
    assert.ok(geo.riverLabel.length > 0, 'the river is labelled');
  }
  assert.deepEqual(geo.out, [], 'labels inside the map');
  // The legend, and the Places list below the map.
  const legend = await page.evaluate(() => { const l = document.querySelector('.map-legend'); return { text: [...l.children].map(x => x.textContent), rows: new Set([...l.children].map(x => Math.round(x.getBoundingClientRect().top))).size }; });
  assert.deepEqual(legend.text, ['You', 'Closed', 'Someone you know'], 'the legend');
  assert.equal(legend.rows, 1, 'the legend is one line in the laptop panel');
  const text = await page.textContent('#panel-body');
  for (const w of ['Exits from here', 'Places you know']) assert.ok(text.includes(w), w);
  assert.equal(await page.textContent('#panel-body h2'), st.locations.find(l => l.id === st.player.locationId).name);
  assert.ok(!(await page.evaluate(() => document.querySelector('.map').innerHTML)).includes('<script'), 'built from nodes');
});

s.test('a closed place is dimmed and struck after a closeLocation effect, and clears when it reopens', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await openPlaces(page);
  const target = await page.evaluate(() => Game.state.locations.find(l => l.id !== Game.state.player.locationId && l.discovered).id);
  let m = await readMap(page);
  assert.ok(m.places.every(p => !p.closed && !p.strike), 'nothing closed at the start');
  await page.evaluate(id => Game.State.apply({ effects: [{ op: 'closeLocation', locationId: id }] }), target);
  m = await readMap(page);
  const p = m.places.find(x => x.id === target);
  assert.ok(p.closed && p.strike && p.struck, 'closed, struck through');
  assert.match(p.aria, /, closed/);
  assert.equal(await page.evaluate(id => getComputedStyle(document.querySelector(`.map-place[data-loc="${id}"] .map-mark`)).opacity, target), '0.5', 'dimmed');
  assert.ok(m.places.filter(x => x.closed).length === 1);
  await page.evaluate(id => Game.State.apply({ effects: [{ op: 'openLocation', locationId: id }] }), target);
  m = await readMap(page);
  assert.ok(!m.places.find(x => x.id === target).closed && !m.places.find(x => x.id === target).strike, 'open again');
});

s.test('people the player has met appear beside the place they were last seen, or here while they are here; three at most, then +N', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const sc = await findScene(page, { min: 1, minAtt: -25 });
  assert.ok(sc, 'a scene with someone in it');
  await place(page, sc.loc.id, sc.phase);
  const npc = sc.npcs[0];
  await sendText(page, `I talk to ${npc.name}`);
  await openPlaces(page);
  let m = await readMap(page);
  const at = id => m.places.find(p => p.people.some(x => x.id === id));
  assert.ok(at(npc.id), 'shown after the turn');
  assert.equal(at(npc.id).id, sc.loc.id, 'beside the place where they are');
  assert.match(at(npc.id).aria, /, with /);
  // The same colour and initials as the person's card.
  await page.click('#tab-people');
  const card = await page.evaluate(id => { const mono = document.querySelector(`.pcard[data-npc="${id}"] .mono`); return { hue: mono.dataset.hue, text: mono.textContent }; }, npc.id);
  await page.click('#tab-places');
  m = await readMap(page);
  const mono = at(npc.id).people.find(x => x.id === npc.id);
  assert.deepEqual({ hue: mono.hue, text: mono.text }, card, 'monogram matches the People card');
  // Walk away (somewhere they are not): they stay where they were last seen.
  const away = await page.evaluate(([from, who]) => {
    const st = Game.state;
    const l = st.locations.find(x => x.id !== from && !x.closed && !Game.State.npcsAt(x.id).some(n => n.id === who));
    return l.id;
  }, [sc.loc.id, npc.id]);
  await page.evaluate(id => Game.State.apply({ playerLocationId: id }), away);
  m = await readMap(page);
  assert.equal(at(npc.id).id, sc.loc.id, 'still beside the place they were last seen');
  assert.ok(!m.places.find(p => p.id === away).people.some(x => x.id === npc.id));
  // Five people met and last seen at a place nobody is shown at: three monograms and "+2".
  const empty = m.places.find(p => !p.people.length && p.id !== away && p.id !== sc.loc.id);
  assert.ok(empty, 'a place with nobody shown');
  const crowd = await page.evaluate(id => {
    const st = Game.state;
    const shown = [...document.querySelectorAll('.map-mono')].map(x => x.dataset.npc);
    const ids = st.npcs.filter(n => n.alive && n.status === 'free' && !shown.includes(n.id) && !Game.State.npcsAt(st.player.locationId).some(x => x.id === n.id)).slice(0, 5).map(n => n.id);
    Game.State.apply({ npcKnownToPlayer: ids });
    ids.forEach((n, i) => { st.seen[n] = { locationId: id, day: 1, phase: 'morning', turn: i }; });
    Game.UI.renderPanel();
    return ids;
  }, empty.id);
  assert.equal(crowd.length, 5);
  m = await readMap(page);
  const busyPlace = m.places.find(p => p.id === empty.id);
  assert.equal(busyPlace.people.length, 3, 'three monograms');
  assert.deepEqual(busyPlace.people.map(x => x.id), crowd.slice(2).reverse(), 'the most recently seen first');
  assert.equal(busyPlace.more, '+2', 'then +N');
  // Someone never met is not on the map.
  const strangers = await page.evaluate(() => Game.state.npcs.filter(n => !n.knownToPlayer && !n.memories.length).map(n => n.id));
  for (const p of m.places) for (const x of p.people) assert.ok(!strangers.includes(x.id), 'stranger on the map: ' + x.id);
});

s.test('tapping another place asks first and the chip walks there (mock mode); the current place, a second tap, the background and a tap while busy do nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  await openPlaces(page);
  const st = await page.evaluate(() => ({ here: Game.state.player.locationId, log: Game.state.log.length, places: Game.state.locations.filter(l => l.discovered && !l.closed).map(l => ({ id: l.id, name: l.name })) }));
  const others = st.places.filter(p => p.id !== st.here);
  const target = others[0];
  const phrase = target.name.replace(/^The /, 'the ');
  const logLen = () => page.evaluate(() => Game.state.log.length);
  // The current place: nothing.
  assert.equal(await page.getAttribute(`.map-place[data-loc="${st.here}"]`, 'aria-disabled'), 'true');
  await tapPlace(page, st.here, true);
  assert.equal(await page.locator('.map-go').count(), 0, 'no chip on the current place');
  assert.equal(await logLen(), st.log);
  // Another place: the chip, and no turn yet.
  await tapPlace(page, target.id);
  assert.equal(await page.textContent('.map-go'), `Go to ${phrase}?`);
  assert.equal(await page.evaluate(() => Game.UI.mapPick), target.id);
  assert.equal(await page.getAttribute(`.map-place[data-loc="${target.id}"]`, 'data-picked'), '1');
  assert.equal(await logLen(), st.log, 'a tap alone spends no turn');
  // A second tap on it, or a tap on the background, takes the chip away.
  await tapPlace(page, target.id);
  assert.equal(await page.locator('.map-go').count(), 0, 'second tap: gone');
  await tapPlace(page, target.id);
  await page.click('.map-svg', { position: { x: 3, y: 3 } });
  assert.equal(await page.locator('.map-go').count(), 0, 'background tap: gone');
  // Tapping a different place moves the chip.
  await tapPlace(page, others[1].id);
  await tapPlace(page, target.id);
  assert.equal(await page.locator('.map-go').count(), 1);
  assert.equal(await page.getAttribute('.map-go', 'data-loc'), target.id);
  // A turn that starts (typed) takes the chip away; taps while it runs do nothing.
  await page.evaluate(() => { Game.Api.Mock.queue('narrate', { delay: 900 }); window.__turn = Game.Pipeline.submit('I look around', { mode: 'do' }); });
  await page.waitForFunction(() => Game.Pipeline.busy);
  assert.equal(await page.locator('.map-go').count(), 0, 'the chip goes when a turn starts');
  await tapPlace(page, target.id);
  assert.equal(await page.locator('.map-go').count(), 0, 'no chip while busy');
  assert.equal(await page.evaluate(() => Game.UI.mapPick), null);
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const before = await logLen();
  // Confirm: a Do turn "I head to <place>." moves the player.
  await tapPlace(page, target.id);
  await page.click('.map-go');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const after = await page.evaluate(() => ({ loc: Game.state.player.locationId, last: Game.state.log[Game.state.log.length - 1], n: Game.state.log.length }));
  assert.equal(after.loc, target.id, 'the player walked there');
  assert.equal(after.n, before + 1, 'one turn');
  assert.equal(after.last.input, `I head to ${phrase}.`);
  assert.equal(after.last.mode, 'do');
  assert.equal(await page.locator('.map-go').count(), 0);
  const m = await readMap(page);
  assert.equal(m.places.find(p => p.ring).id, target.id, 'the ring moved');
  assert.equal(await page.inputValue('#cmd'), '', 'the box is untouched');
  // In Say mode the map still sends a Do turn.
  await page.click('#mode-say');
  const next = others.find(p => p.id !== target.id);
  await tapPlace(page, next.id);
  await page.click('.map-go');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), next.id);
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].mode), 'do');
});

s.test('keyboard: Enter on a place shows the chip and focuses it, Escape takes it away, Enter on the chip walks there', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  await openPlaces(page);
  const target = await page.evaluate(() => Game.state.locations.find(l => l.discovered && !l.closed && l.id !== Game.state.player.locationId).id);
  await page.focus(`.map-place[data-loc="${target}"]`);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'map-go placed', 'the chip has focus');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.map-go').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.loc), target, 'focus back on the place');
  await page.keyboard.press(' ');
  assert.equal(await page.locator('.map-go').count(), 1, 'Space works too');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), target);
  // A chip opened by a tap also goes on Escape.
  const other = await page.evaluate(() => Game.state.locations.find(l => l.discovered && !l.closed && l.id !== Game.state.player.locationId).id);
  await tapPlace(page, other);
  assert.equal(await page.locator('.map-go').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.map-go').count(), 0, 'Escape takes a tapped chip away');
});

s.test('a map turn that fails is rolled back and leaves "I head to ..." in the box, like a typed one', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  await openPlaces(page);
  const before = await page.evaluate(() => ({ loc: Game.state.player.locationId, log: Game.state.log.length }));
  const target = await page.evaluate(() => { const l = Game.state.locations.find(x => x.discovered && !x.closed && x.id !== Game.state.player.locationId); return { id: l.id, phrase: l.name.replace(/^The /, 'the ') }; });
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { error: { type: 'overloaded_error' } }));
  await tapPlace(page, target.id);
  await page.click('.map-go');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const after = await page.evaluate(() => ({ loc: Game.state.player.locationId, log: Game.state.log.length }));
  assert.deepEqual(after, before, 'nothing changed');
  assert.equal(await page.inputValue('#cmd'), `I head to ${target.phrase}.`);
});

s.test('375 wide: the map fills the sheet, labels are 11px or more, hit areas 44px or more, nothing overflows; the chip stays on screen and confirming closes the sheet', async h => {
  const page = await h.open({ viewport: PHONE });
  await quickStart(page);
  await fast(page);
  await openPlaces(page);
  const sizes = () => page.evaluate(() => {
    const svg = document.querySelector('.map-svg');
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return {
      width: svg.getBoundingClientRect().width, sheet: document.getElementById('panel').getBoundingClientRect().width,
      fonts: [...svg.querySelectorAll('.map-label, .map-caption, .map-area, .map-river-label')].map(t => parseFloat(getComputedStyle(t).fontSize) * scale),
      hits: [...svg.querySelectorAll('.map-hit')].map(r => { const b = r.getBoundingClientRect(); return Math.min(b.width, b.height); })
    };
  });
  let z = await sizes();
  assert.ok(Math.abs(z.width - z.sheet) < 1, `map ${z.width} wide in a ${z.sheet} sheet`);
  assert.ok(Math.min(...z.fonts) >= 11, 'smallest label ' + Math.min(...z.fonts).toFixed(2) + 'px');
  assert.ok(Math.min(...z.hits) >= 44, 'smallest hit area ' + Math.min(...z.hits).toFixed(1) + 'px');
  assert.deepEqual(await overflowReport(page, 375), [], 'sheet with the map');
  assert.equal(await page.evaluate(() => new Set([...document.querySelector('.map-legend').children].map(x => Math.round(x.getBoundingClientRect().top))).size), 1, 'the legend is one line');
  // The place furthest right: its chip stays on screen.
  const st = await page.evaluate(() => ({ here: Game.state.player.locationId }));
  const right = await page.evaluate(here => [...document.querySelectorAll('.map-place')].filter(g => g.dataset.loc !== here && g.dataset.closed !== '1')
    .map(g => ({ id: g.dataset.loc, x: g.querySelector('.map-mark').getBoundingClientRect().right })).sort((a, b) => b.x - a.x)[0].id, st.here);
  await tapPlace(page, right);
  const chip = await page.evaluate(() => { const r = document.querySelector('.map-go').getBoundingClientRect(); const m = document.querySelector('.map').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, h: r.height, w: r.width, mTop: m.top, mBottom: m.bottom }; });
  assert.ok(chip.left >= 0 && chip.right <= 375, `chip on screen [${chip.left}, ${chip.right}]`);
  assert.ok(chip.top >= chip.mTop && chip.bottom <= chip.mBottom, 'chip inside the map');
  assert.ok(chip.h >= 44 && chip.w >= 44, 'chip is a 44px target');
  assert.deepEqual(await overflowReport(page, 375), [], 'with the chip');
  await page.click('.map-go');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), right);
  assert.ok(!(await page.evaluate(() => document.getElementById('game-body').classList.contains('sheet-open'))), 'the sheet closed to show the walk');
  // Laptop panel: still 11px labels and 44px hit areas.
  await page.setViewportSize(LAPTOP);
  await page.evaluate(() => Game.UI.openPanel('places'));
  z = await sizes();
  assert.ok(Math.min(...z.fonts) >= 11, 'laptop: smallest label ' + Math.min(...z.fonts).toFixed(2) + 'px');
  assert.ok(Math.min(...z.hits) >= 44, 'laptop: smallest hit area ' + Math.min(...z.hits).toFixed(1) + 'px');
  assert.ok(Math.abs(z.width - z.sheet + 1) < 1.5, `laptop: the map spans the ${z.sheet}px panel (${z.width})`);
});

s.test('both themes draw the map from their own tokens, with no page errors', async h => {
  for (const scheme of ['dark', 'light']) {
    const page = await h.open({ viewport: LAPTOP, colorScheme: scheme });
    await quickStart(page);
    await openPlaces(page);
    const r = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const tok = k => root.getPropertyValue(k).trim();
      const probe = document.createElement('i');
      document.body.append(probe);
      const rgb = v => { probe.style.color = v; return getComputedStyle(probe).color; };
      const fill = sel => getComputedStyle(document.querySelector(sel)).fill;
      const stroke = sel => getComputedStyle(document.querySelector(sel)).stroke;
      const out = {
        theme: document.documentElement.dataset.theme,
        tokens: ['--map-water', '--map-bank', '--map-road', '--map-land', '--map-ink'].map(tok),
        land: fill('.map-land') === rgb(tok('--map-land')),
        ink: fill('.map-mark') === rgb(tok('--map-ink')),
        road: stroke('.map-road') === rgb(tok('--map-road')),
        water: !document.querySelector('.map-water') || stroke('.map-water') === rgb(tok('--map-water')),
        bank: !document.querySelector('.map-bank') || stroke('.map-bank') === rgb(tok('--map-bank'))
      };
      probe.remove();
      return out;
    });
    assert.equal(r.theme, scheme === 'dark' ? 'dark' : 'parchment');
    assert.ok(r.tokens.every(Boolean), 'all five map tokens set: ' + r.tokens);
    assert.ok(r.land && r.ink && r.road && r.water && r.bank, JSON.stringify(r));
    h[scheme] = r.tokens;
  }
  assert.notDeepEqual(h.dark, h.light, 'the themes differ');
});

s.test('a place without coordinates goes beside its exit, and a town without map data still draws every place inside the map', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await openPlaces(page);
  const here = await page.evaluate(() => Game.state.player.locationId);
  await page.evaluate(id => Game.State.apply({ addLocations: [{ id: 'loc_test_shed', name: 'The Back Shed', type: 'shed', description: 'A shed.', exits: [id] }] }), here);
  const check = () => page.evaluate(() => {
    const L = Game.UI.mapLayout(Game.state);
    const pts = L.pts.map(p => ({ id: p.id, x: p.x, y: p.y }));
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    return { W: L.W, H: L.H, pts, min, river: !!L.river, roads: L.roads.map(r => r.key) };
  });
  let r = await check();
  const shed = r.pts.find(p => p.id === 'loc_test_shed');
  assert.ok(shed, 'the new place is on the map');
  assert.ok(shed.x >= 0 && shed.x <= r.W && shed.y >= 0 && shed.y <= r.H, 'inside the map');
  assert.ok(r.min >= 28, 'no two places closer than 28: ' + r.min);
  assert.ok(r.roads.includes(['loc_test_shed', here].sort().join('|')), 'with its road');
  assert.equal((await readMap(page)).places.find(p => p.id === 'loc_test_shed').label, 'Back Shed');
  // A hand-edited town with no map at all (and no built-in fallback): a grid.
  await page.evaluate(() => {
    const st = Game.state;
    delete Game.State.town.map;
    for (const l of Game.State.town.locations) delete l.map;
    for (const l of st.locations) delete l.map;
    st.meta.townName = 'Somewhere Else';
    Game.UI.renderPanel();
  });
  r = await check();
  assert.ok(!r.river, 'no river without map data');
  assert.equal(r.W, 360);
  assert.ok(r.pts.every(p => p.x >= 0 && p.x <= r.W && p.y >= 0 && p.y <= r.H), 'all inside');
  assert.ok(r.min >= 28, 'grid spacing ' + r.min);
  const m = await readMap(page);
  assert.equal(m.places.length, r.pts.length);
  assert.ok(m.places.some(p => p.ring));
});

s.test('validate-town.cjs checks the map data: every place mapped, inside the bounds, short labels, a valid anchor, 28 units apart', async () => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const at = html.indexOf('// ===== BEGIN CONTENT =====');
  const lines = [...html.slice(at).matchAll(/\n      map: \{ x: (\d+), y: (\d+), label: "([^"]*)", anchor: "([nsew])" \},/g)];
  if (!/\n  map: \{/.test(html.slice(at)) || lines.length < 2) { console.log('        (the town has no map data; skipped)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-map-'));
  const tmp = path.join(dir, 'index.html');
  const run = text => { fs.writeFileSync(tmp, text); return spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) }); };
  const edit = (i, fn) => { const m = lines[i]; const cut = at + m.index; return html.slice(0, cut) + fn(m[0], m) + html.slice(cut + m[0].length); };
  const cases = [
    ['a place with no map', edit(0, () => ''), /missing: with TOWN_DATA\.map every location needs map/],
    ['a four-word label', edit(0, (s, m) => s.replace(`label: "${m[3]}"`, 'label: "one two three four"')), /one to three words, found 4/],
    ['a bad anchor', edit(0, (s, m) => s.replace(`anchor: "${m[4]}"`, 'anchor: "ne"')), /must be "n", "s", "e" or "w"/],
    ['outside the map', edit(0, (s, m) => s.replace(`x: ${m[1]},`, 'x: 9999,')), /must be a number from 0 to \d+ \(the map width\)/],
    ['two places too close', edit(1, (s, m) => s.replace(`x: ${m[1]}, y: ${m[2]}`, `x: ${+lines[0][1] + 10}, y: ${+lines[0][2] + 10}`)), /keep them at least 28 apart/],
    ['a road that is not a path', html.replace(/\n    roads: \[\n      "/, '\n    roads: [\n      "javascript:'), /must be an SVG path/]
  ];
  for (const [what, text, want] of cases) {
    assert.notEqual(text, html, what + ': the edit applied');
    const r = run(text);
    assert.equal(r.status, 1, what + ' should fail');
    assert.match(r.stderr, want, what);
  }
  // Coordinates are optional while TOWN_DATA.map is absent.
  const noMap = html.slice(0, at) + html.slice(at).replace(/\n  \/\/ The town map in the Places tab[\s\S]*?\n  map: \{[\s\S]*?\n  \},\n/, '\n').replace(/\n      map: \{[^\n]*\},/g, '');
  assert.notEqual(noMap, html);
  const ok = run(noMap);
  assert.equal(ok.status, 0, ok.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

s.test('a place someone told you about is drawn at its stored point with a dashed marker and "Heard of" in the legend; 375 wide nothing overflows and it taps like any place', async h => {
  const page = await h.open({ viewport: PHONE });
  await quickStart(page, { kinds: [] });
  await fast(page);
  // A cast member's home the player has not found: someone telling them about it puts it on the map.
  const { id, hidden } = await page.evaluate(() => {
    const st = Game.state;
    const owner = st.npcs.find(n => n.home && !Game.State.loc(n.home.locationId).discovered);
    const hidden = owner.home.locationId;
    Game.State.apply({ beginTurn: true });
    const r = Game.State.apply({ placesRevealed: [{ name: owner.name.split(' ')[0] + "'s house", type: 'house', description: 'A white house up the river road.', nearId: st.player.locationId, ownerNpcId: owner.id, kind: 'home' }] }, { source: 'model' });
    return { id: r.revealed[0], hidden };
  });
  assert.equal(id, hidden, 'the home the cast wrote, discovered, not a second one');
  await openPlaces(page);
  const r = await page.evaluate(id => {
    const L = Game.UI.mapLayout(Game.state);
    const p = L.pts.find(q => q.id === id);
    const g = document.querySelector(`.map-place[data-loc="${id}"]`);
    const mark = g.querySelector('.map-mark');
    const svg = document.querySelector('.map-svg');
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return {
      at: [p.x, p.y], stored: Game.State.loc(id).map, heard: g.dataset.heard, dash: getComputedStyle(mark).strokeDasharray,
      label: [...g.querySelectorAll('.map-label')].map(t => t.textContent).join(' '), aria: g.getAttribute('aria-label'),
      font: parseFloat(getComputedStyle(g.querySelector('.map-label')).fontSize) * scale, hit: Math.min(g.querySelector('.map-hit').getBoundingClientRect().width, g.querySelector('.map-hit').getBoundingClientRect().height),
      legend: [...document.querySelector('.map-legend').children].map(x => x.textContent), legendRows: new Set([...document.querySelector('.map-legend').children].map(x => Math.round(x.getBoundingClientRect().top))).size
    };
  }, id);
  assert.deepEqual(r.at, [r.stored.x, r.stored.y], 'drawn at the point stored with it');
  assert.equal(r.heard, '1');
  assert.ok(r.dash && r.dash !== 'none', 'dashed: ' + r.dash);
  assert.equal(r.label, r.stored.label);
  assert.match(r.aria, /heard of, not visited yet/);
  assert.ok(r.font >= 11 && r.hit >= 44, JSON.stringify(r));
  assert.deepEqual(r.legend, ['You', 'Closed', 'Heard of', 'Someone you know']);
  assert.equal(r.legendRows, 1, 'the legend still fits one line at 375');
  assert.deepEqual(await overflowReport(page, 375), [], 'nothing overflows at 375');
  // It taps like any place: the chip offers the walk.
  await tapPlace(page, id);
  assert.equal(await page.textContent('.map-go'), `Go to ${await page.evaluate(id => Game.State.loc(id).name.replace(/^The /, 'the '), id)}?`);
});

s.test('a place\'s sheet lists its work (direction change 16): what, for whom (by name once met) and when, marked once done; a place with none has no such row; /jobs lists the work at the places known; 375 wide nothing overflows', async h => {
  for (const viewport of [LAPTOP, PHONE]) {
    const page = await h.open({ viewport });
    await quickStart(page);
    await fast(page);
    const w = await page.evaluate(() => {
      const G = Game;
      const J = G.data.JOBS;
      // A known place with two jobs if there is one, else with one; and a known place with none.
      const known = G.state.locations.filter(l => l.discovered && !l.away);
      const many = known.find(l => J.filter(j => j.locationId === l.id).length > 1) || known.find(l => J.some(j => j.locationId === l.id));
      const none = known.find(l => !J.some(j => j.locationId === l.id));
      const phases = p => (p.length < 3 ? p.join(' and ') : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`);
      const rowOf = j => `${j.label.charAt(0).toUpperCase() + j.label.slice(1)} (${j.stake ? 'with' : 'for'} ${G.npcLabel(G.State.npc(j.giverNpcId))}, ${phases(j.phases)})`;
      return { many: many.id, manyName: many.name, none: none.id, rows: J.filter(j => j.locationId === many.id).map(rowOf), jobs: J.filter(j => j.locationId === many.id).map(j => ({ id: j.id, giver: j.giverNpcId, phase: j.phases[0], label: j.label, stake: !!j.stake })) };
    });
    await openPlaces(page);
    const read = id => page.evaluate(i => { const dd = document.querySelector(`.plcard[data-loc="${i}"] dd[data-fact="work-here"]`); return dd ? dd.textContent : null; }, id);
    await page.evaluate(id => Game.UI.togglePlace(id, true), w.many);
    assert.equal(await read(w.many), w.rows.join('; '), 'the work here, by label for a stranger');
    await page.evaluate(id => Game.UI.togglePlace(id, true), w.none);
    assert.equal(await read(w.none), null, 'no row where there is no work');
    if (viewport === PHONE) assert.deepEqual(await overflowReport(page, PHONE.width), [], 'nothing overflows at 375');
    // Worked today, by someone now met: the giver by name and "done for today".
    const j = w.jobs.find(x => !x.stake);
    await page.evaluate(([id, giver]) => { Game.State.apply({ workDone: { jobId: id, outcome: 'success' }, npcKnownToPlayer: [giver] }); }, [j.id, j.giver]);
    await page.evaluate(id => Game.UI.togglePlace(id, true), w.many);
    const name = await page.evaluate(id => Game.State.npc(id).name, j.giver);
    assert.ok((await read(w.many)).includes(`${j.label.charAt(0).toUpperCase() + j.label.slice(1)} (for ${name}, `) && (await read(w.many)).includes('; done for today)'), await read(w.many));
    if (viewport === LAPTOP) {
      await page.focus('#cmd');
      await sendText(page, '/jobs');
      const notice = await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent);
      assert.ok(notice.startsWith(`Work you know of (ask for it there; it is ${await page.evaluate(() => Game.state.time.phase)} now). `), notice);
      assert.ok(notice.includes(`${w.manyName}: `) && notice.includes('done for today'), notice);
      assert.equal(await page.evaluate(() => Game.state.meta.turn), 0, '/jobs spends no turn');
    }
  }
});

s.run();
