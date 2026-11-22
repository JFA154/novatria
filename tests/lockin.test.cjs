'use strict';
/* Lock-In (lockin.html; the front page from the owner's "make lock-in the
   front page" until Bones was): the detective game at the Low Water (the owner,
   of Last Call: "how can I make it playable and entertaining, not just
   play it once, cool, then nah"; then "what about using that foundation to
   make a different game"; then "Okay let's do the interrogation"). The
   code owns who did it, where everyone was, who lies and about what, what
   puts a person in the clear and whether the player's case is airtight;
   each person is one Claude call told only their own account, or the
   scripted room (no key, and any call that failed).
   Covered here: the page alone from file:// with the network shut; the
   case generator (one guilty, never clearable; every innocent clearable;
   the shortest way through within the level's range and replayable
   through the game's own buttons); a player who knows only the notebook
   closing every case, and nearly all of them inside the questions given;
   tonight's case through the buttons on a phone (the briefing, a question,
   the notebook, putting one account to another, the changed story, naming
   one, the reveal, the casebook, the result to copy, a reload); proof
   moving a liar and a bluff not; the wrong one and a hunch; the questions
   running out; who has been in the chair before; what the scripted room
   makes of a typed question; the Claude path against a stand-in API (the
   request's shape, what each person is and is not told, what goes in the
   notebook, a lie given up only with proof, a failed call falling back to
   the script; a key Anthropic refuses, or none: which key was sent, a new
   one taken in place, the question asked again and nothing spent); phone
   widths; no innerHTML and one fetch.
   Run with: node tests/run.cjs lockin */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, overflowReport, PHONE } = require('./helpers.cjs');

const FILE = path.resolve(__dirname, '..', 'lockin.html');
const URL = 'file://' + FILE;
const s = suite('lockin');
const open = (h, opts) => h.open(Object.assign({ url: URL, consent: false, viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
// Open a case without the first screen, the briefing closed, the scripted room answering at once.
const sit = async (page, opts) => {
  await page.evaluate(o => { Game.App.speed = 0; Game.App.newCase(Object.assign({ seed: 5, level: 2, mode: 'demo' }, o)); document.getElementById('dlg').close(); }, opts || {});
};
const idle = page => page.waitForFunction(() => !Game.busy);
const st = page => page.evaluate(() => { const g = Game.state; return { left: g.left, asked: g.asked, sel: g.sel, notes: g.notes.map(n => Game.Rules.noteId(n) + (n.struck ? '!' : '')), caught: g.caught, over: g.over, c: g.c }; });
const logText = page => page.evaluate(() => Game.state.log.map(e => (e.t === 'sys' ? `[${e.kind}] ${e.text}` : e.t === 'you' ? `> ${e.text}` : `${e.id}: ${e.text}`)));
/* A stand-in for the API: answers each call with JSON of the shape asked
   for. opts.reply(user, body): the answer's fields for a person's turn. */
function standIn(bodies, opts) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  return async route => {
    const req = route.request();
    const u = req.url();
    if (/^(file|blob|data):/.test(u)) return route.continue();
    if (u !== 'https://api.anthropic.com/v1/messages') return route.abort();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    bodies.push({ body, headers: req.headers() });
    if (opts && opts.badKey && req.headers()['x-api-key'] === opts.badKey) return route.fulfill({ status: 401, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
    if (opts && opts.fail) return route.fulfill({ status: 500, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'the stand-in is down' } }) });
    const user = body.messages[0].content.map(c => c.text).join('\n');
    const need = body.output_config.format.schema.required;
    const out = need.length === 1 ? { say: 'Well. There it is.' } : Object.assign({ say: 'I was where I said I was.', told: [], cracked: false, aside: 'Let this be over.' }, opts && opts.reply ? opts.reply(user, body) : {});
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) });
  };
}

s.test('the page stands alone: it opens from file:// with the network shut, the people are Last Call\'s, and the first screen offers tonight\'s case', async h => {
  const asked = [];
  const page = await open(h, { route: route => { const u = route.request().url(); if (/^(file|blob|data):/.test(u)) return route.continue(); asked.push(u); return route.abort(); } });
  assert.equal(await page.title(), 'Lock-In');
  const info = await page.evaluate(() => ({ cast: Game.CAST.length, host: Game.CAST.some(c => c.id === Game.HOST), daily: document.querySelector('#btn-daily').hidden, book: document.querySelector('#home-book').hidden, cont: document.querySelector('#home-continue-row').hidden, mode: document.querySelector('#f-mode [aria-pressed="true"]').dataset.v }));
  assert.equal(info.cast, 50, 'the bank of fifty');
  assert.ok(info.host, 'Loretta among them');
  assert.equal(info.daily, false);
  assert.equal(info.book, true, 'no casebook before a case');
  assert.equal(info.cont, true);
  assert.equal(info.mode, 'demo', 'with no key anywhere, the scripted room is what one tap starts');
  assert.deepEqual(asked, [], 'nothing is asked of the network');
  assert.deepEqual(await overflowReport(page, 375), []);
});

s.test('a case has one guilty person who can never be put in the clear, and every innocent one can be: three levels, a hundred seeds each', async h => {
  const page = await open(h);
  const out = await page.evaluate(() => {
    const R = Game.Rules; const bad = []; const seen = { shapes: {}, crimes: {}, mins: {} };
    for (const level of [1, 2, 3]) {
      for (let seed = 1; seed <= 100; seed++) {
        const c = R.makeCase(seed, level); const L = R.LEVELS[level]; const tag = `level ${level} seed ${seed}`;
        if (!c) { bad.push(`${tag}: no case`); continue; }
        seen.shapes[c.shape] = 1; seen.crimes[c.crime] = 1; seen.mins[`${level}:${c.min}`] = 1;
        if (JSON.stringify(R.makeCase(seed, level)) !== JSON.stringify(c)) bad.push(`${tag}: a seed is not one case`);
        if (c.people.length !== L.n || new Set(c.people).size !== L.n || c.people.includes(Game.HOST)) bad.push(`${tag}: the room`);
        if (new Set(c.people.map(p => Game.CAST.find(x => x.id === p).name.split(' ')[0])).size !== L.n) bad.push(`${tag}: two with one first name`);
        if (c.min < L.min[0] || c.min > L.min[1] || c.line.length !== c.min) bad.push(`${tag}: shortest ${c.min}`);
        if (c.budget !== L.n + L.spare) bad.push(`${tag}: budget ${c.budget}`);
        if (c.T[c.culprit][1] !== c.scene || c.T[c.culprit][0] !== c.q || !c.story[c.culprit][1].lie) bad.push(`${tag}: the guilty one`);
        if (c.people.some(p => p !== c.culprit && (c.T[p][1] === c.scene || c.story[p][0].lie))) bad.push(`${tag}: an innocent one where it happened, or lying about before`);
        // Everything there is to know: every account, and every liar caught out.
        for (const ver of [0, 1]) {
          const all = []; for (const p of [Game.HOST].concat(c.people)) for (const slot of [0, 1]) all.push(R.acct(c, p, slot, ver));
          if (R.clearedBy(c, all, c.culprit)) bad.push(`${tag}: the guilty one can be put in the clear (version ${ver})`);
          if (ver && !R.airtight(c, all, c.culprit)) bad.push(`${tag}: an innocent one can never be put in the clear`);
          if (c.people.some(p => p !== c.culprit && R.airtight(c, all, p))) bad.push(`${tag}: airtight against the wrong one`);
        }
        const liars = c.people.filter(p => p !== c.culprit && c.story[p][1].lie);
        if (liars.length < (L.pair ? 2 : 0) || (level === 1 && liars.length) || (level === 2 && liars.length !== 1)) bad.push(`${tag}: ${liars.length} innocent liars`);
        if (c.point && (c.point.real ? c.point.about !== c.culprit : c.point.by !== c.culprit)) bad.push(`${tag}: who saw whom`);
      }
    }
    return { bad, shapes: Object.keys(seen.shapes).sort(), crimes: Object.keys(seen.crimes).length, mins: Object.keys(seen.mins).sort() };
  });
  assert.deepEqual(out.bad, []);
  assert.deepEqual(out.shapes, ['A', 'B', 'C', 'D'], 'all four of the guilty one\'s stories turn up');
  assert.equal(out.crimes, 8);
  assert.deepEqual(out.mins, ['1:2', '1:3', '2:3', '2:4', '3:4', '3:5'], 'and each level has easier and harder nights');
});

s.test('the shortest way through is real: asked through the game\'s own buttons it leaves the notebook airtight, for three stars', async h => {
  const page = await open(h);
  const out = await page.evaluate(async () => {
    const R = Game.Rules, A = Game.App; A.speed = 0; const bad = [];
    for (const level of [1, 2, 3]) {
      for (let seed = 1; seed <= 12; seed++) {
        A.newCase({ seed, level, mode: 'demo' }); document.getElementById('dlg').close();
        const g = Game.state; const c = g.c;
        for (const a of c.line) {
          g.sel = a[1];
          if (a[0] === 'a') await A.ask('Where?', { k: 'a', slot: a[2] }).catch(() => {});
          else { const n = g.notes.find(x => x.k === 'a' && !x.struck && x.by === a[2] && x.slot === a[3]); await A.put(R.noteId(n)); }
        }
        if (g.asked !== c.min || !R.airtight(c, g.notes, c.culprit)) { bad.push(`level ${level} seed ${seed}: ${g.asked} asked of ${c.min}, airtight ${R.airtight(c, g.notes, c.culprit)}`); continue; }
        await A.accuse(c.culprit); document.getElementById('dlg').close();
        if (Game.state.over.stars !== 3) bad.push(`level ${level} seed ${seed}: ${Game.state.over.stars} stars`);
      }
    }
    return bad;
  });
  assert.deepEqual(out, []);
});

s.test('a player who knows only what is in the notebook, and asks methodically, closes every case, and nearly all of them inside the questions given', async h => {
  const page = await open(h);
  const out = await page.evaluate(async () => {
    const R = Game.Rules, A = Game.App, H = Game.HOST; A.speed = 0; const res = {};
    const play = async (seed, level, budget) => {
      A.newCase({ seed, level, mode: 'demo' }); document.getElementById('dlg').close();
      const g = Game.state, c = g.c; if (budget) g.left = budget;
      const asked = new Set(); const tried = new Set();
      const open = () => c.people.filter(p => !R.clearedBy(c, g.notes, p));
      const acct = async (p, slot) => { asked.add(p + slot); g.sel = p; await A.ask('Where?', { k: 'a', slot }); };
      const put = async (n, p) => { tried.add(`${R.noteId(n)}>${p}`); g.sel = p; await A.put(R.noteId(n)); };
      while (g.left > 0 && open().length > 1) {
        if (!asked.has(H + 1)) { await acct(H, 1); continue; }
        // Someone who has owned up and named who they were with: put it to that one.
        let did = false;
        for (const n of g.notes) { if (n.k !== 'a' || n.ver !== 1 || n.struck || !open().includes(n.by)) continue; const j = n.with.find(x => !tried.has(`${R.noteId(n)}>${x}`)); if (j) { await put(n, j); did = true; break; } }
        if (did) continue;
        // Two accounts that do not fit, with one of the two not yet in the clear: put the other's to the one whose own account it is.
        for (const a of g.notes) {
          if (a.k !== 'a' || a.struck || a.by === H) continue;
          const n = g.notes.find(x => x.k === 'a' && !x.struck && x.by !== a.by && x.slot === a.slot && !tried.has(`${R.noteId(x)}>${a.by}`) && (open().includes(a.by) || open().includes(x.by))
            && ((x.place === a.place && !x.with.includes(a.by)) || (x.with.includes(a.by) && x.place !== a.place) || (a.with.includes(x.by) && x.place !== a.place)));
          if (n) { await put(n, a.by); did = true; break; }
        }
        if (did) continue;
        const next = open().find(p => !asked.has(p + 1)) || c.people.find(p => !asked.has(p + 1));
        if (next) { await acct(next, 1); continue; }
        if (!asked.has(H + 0)) { await acct(H, 0); continue; }
        const before = c.people.find(p => !asked.has(p + 0));
        if (before) { await acct(before, 0); continue; }
        break;
      }
      const left = open();
      await A.accuse(left.find(p => g.caught.includes(p)) || left[0]); document.getElementById('dlg').close();
      return { solved: left.length === 1, stars: Game.state.over.stars, asked: Game.state.asked };
    };
    for (const level of [1, 2, 3]) {
      let solved = 0, inside = 0, wrong = 0; const n = 40;
      for (let seed = 1; seed <= n; seed++) { const free = await play(seed, level, 60); if (free.solved && free.stars >= 2) solved++; const real = await play(seed, level, 0); if (real.stars >= 2) inside++; if (real.stars === 0) wrong++; }
      res[level] = { n, solved, inside, wrong };
    }
    return res;
  });
  for (const level of [1, 2, 3]) assert.equal(out[level].solved, out[level].n, `level ${level}: every case can be closed airtight from the notebook alone`);
  assert.equal(out[1].inside, out[1].n, 'an open-and-shut case never runs out of questions');
  assert.ok(out[2].inside >= out[2].n * 0.85, `a long night: ${out[2].inside} of ${out[2].n} inside the questions given`);
  assert.ok(out[3].inside >= out[3].n * 0.6, `nobody's talking: ${out[3].inside} of ${out[3].n} inside the questions given`);
});

s.test('tonight\'s case through the buttons on a phone: the briefing, a question, the notebook, one account put to another, the changed story, naming one, the reveal, the casebook, and the result to copy', async h => {
  const page = await open(h);
  await page.evaluate(() => { Game.App.speed = 0; Game.App.now = () => new Date(2026, 10, 19, 21, 0, 0); Game.UI.home(); });
  assert.equal(await page.textContent('#daily-title'), 'Thursday 19 November');
  assert.match(await page.textContent('#daily-line'), /^A long night\..*The same case for everybody, once\.$/);
  await page.click('#btn-daily');
  // The briefing: what, when, where, the trace, who is kept back, how many questions.
  const c = (await st(page)).c;
  const brief = await page.textContent('#dlg');
  assert.match(brief, /It happened around /);
  assert.match(brief, /Found there: /);
  assert.match(brief, new RegExp(`You get ${c.budget} questions\\.`));
  assert.equal(c.level, 2);
  assert.equal(c.people.length, 5);
  await page.click('dialog .btn.primary');
  assert.equal(await page.textContent('#tb-left'), `${c.budget} left`);
  assert.equal(await page.$$eval('#strip .who', els => els.length), 6, 'Loretta and the five kept back');
  assert.equal(await page.$$eval('#strip .who svg.face', els => els.length), 6, 'each with a face');
  assert.equal(await page.getAttribute('#strip .who[data-sel="1"]', 'data-id'), 'npc_loretta', 'Loretta is in the chair first');
  assert.deepEqual(await overflowReport(page, 375), []);
  // The same date deals the same case.
  const again = await page.evaluate(() => { const R = Game.Rules; return JSON.stringify(R.makeCase(Game.state.c.seed, 2)) === JSON.stringify(Game.state.c); });
  assert.ok(again);
  // A question by its button: it is one off the count, answered, and noted.
  await page.click('#chips .chip >> nth=0');
  await idle(page);
  let g = await st(page);
  assert.equal(g.left, c.budget - 1);
  assert.deepEqual(g.notes, ['a|npc_loretta|1|0']);
  assert.match((await logText(page)).join('\n'), /\[note\] Loretta says .* at the bar at /);
  // It is in the notes at once, and the top bar says there is something new there.
  assert.equal(await page.textContent('#btn-notes'), 'Notes (1)');
  assert.equal(await page.isVisible('#notes'), false, 'on a phone the notes are a page of their own');
  await page.click('#btn-notes');
  assert.equal(await page.isVisible('#notes'), true);
  assert.equal(await page.isVisible('#log-wrap'), false);
  assert.equal(await page.textContent('#btn-notes'), 'Back to the room');
  assert.match(await page.textContent('#nt-grid thead'), /Around .*At /);
  assert.equal(await page.$$eval('#nt-grid tbody tr', els => els.length), 6, 'a row each, and the bar');
  assert.doesNotMatch(await page.textContent('#nt-grid td[data-cell="npc_loretta|1"]'), /Not asked/);
  assert.equal(await page.textContent('#nt-grid td[data-cell="npc_loretta|0"]'), 'Not asked');
  assert.match(await page.textContent('#nt-put'), /^Put it to them$/);
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.click('#btn-notes');
  assert.equal(await page.isVisible('#notes'), false);
  assert.equal(await page.textContent('#btn-notes'), 'Notes', 'looked at');
  // A typed question to someone else.
  const other = c.people.find(p => p !== c.culprit && !c.story[p][1].lie);
  await page.click(`#strip .who[data-id="${other}"]`);
  assert.match(await page.getAttribute('#say', 'placeholder'), /^Ask \w+ something$/);
  await page.fill('#say', `where were you at ${c.times[1]}?`);
  await page.press('#say', 'Enter');
  await idle(page);
  g = await st(page);
  assert.ok(g.notes.includes(`a|${other}|1|0`), 'what they said is in the notes');
  assert.equal(g.left, c.budget - 2);
  // Where they said they were at that time is in their row of the grid, under that time; the other time is still to ask.
  const said = await page.evaluate(id => { const R = Game.Rules; const n = Game.state.notes.find(x => x.by === id && x.slot === 1); return R.PLACES[n.place].at; }, other);
  assert.match((await page.textContent(`#nt-grid td[data-cell="${other}|1"] .nt-own`)).toLowerCase(), new RegExp(`^${said}`));
  assert.equal(await page.textContent(`#nt-grid td[data-cell="${other}|0"]`), 'Not asked');
  // And whoever they named as company has that under their own name: who else has put them there.
  const company = await page.evaluate(id => Game.state.notes.find(x => x.by === id && x.slot === 1).with, other);
  for (const w of company) assert.equal(await page.$$eval(`#nt-grid td[data-cell="${w}|1"] .nt-by[data-by="${other}"]`, els => els.length), 1);
  // The marks are the player's own.
  await page.click('#sheet [data-mark="clear"]');
  assert.equal(await page.getAttribute(`#strip .who[data-id="${other}"]`, 'data-mark'), 'clear');
  // The innocent liar: asked, then shown what proves it.
  const liar = c.people.find(p => p !== c.culprit && c.story[p][1].lie);
  await page.click(`#strip .who[data-id="${liar}"]`);
  await page.click('#chips .chip >> nth=0');
  await idle(page);
  const proof = await page.evaluate(async liar => {
    // (Whatever true account proves it: asked for here if the notebook does not hold one yet.)
    const R = Game.Rules, g = Game.state, c = g.c;
    const find = () => g.notes.find(n => R.conflicts(n, liar, c.story[liar][1]));
    for (const p of [Game.HOST].concat(c.people)) { if (find()) break; if (p === liar) continue; g.sel = p; await Game.App.ask('Where?', { k: 'a', slot: 1 }); }
    g.sel = liar; Game.UI.render();
    return R.noteId(find());
  }, liar);
  await page.click('#chips .chip[data-chip="put"]');
  assert.equal(await page.isVisible('#notes'), true, 'Put it to them opens the notes');
  assert.match(await page.textContent('#notes'), /is in the chair\. Putting something to (him|her|them) is one question\./);
  assert.equal(await page.$(`#notes [data-put^="a|${liar}|"]`), null, 'nobody is shown their own words');
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.click(`#notes [data-put="${proof}"]`);
  await idle(page);
  assert.equal(await page.isVisible('#notes'), false, 'and the notes step aside for the answer');
  g = await st(page);
  assert.deepEqual(g.caught, [liar]);
  assert.ok(g.notes.includes(`a|${liar}|1|0!`), 'the first story is struck');
  assert.ok(g.notes.includes(`a|${liar}|1|1`), 'and the new one is in');
  assert.equal(await page.$$eval('#log .say[data-changed="1"]', els => els.length), 1);
  assert.match(await page.textContent('#log .say[data-changed="1"]'), /changes their story/);
  assert.equal(await page.textContent(`#strip .who[data-id="${liar}"] .who-tag`), 'lied');
  // In the grid the first story is struck through, with the new one under it.
  assert.deepEqual(await page.$$eval(`#nt-grid td[data-cell="${liar}|1"] .nt-own`, els => els.map(e => e.dataset.struck)), ['1', '0']);
  // Ask the rest about when it happened, so nobody else is left; then name the one.
  await page.evaluate(async () => { const g = Game.state; for (const p of [Game.HOST].concat(g.c.people)) { if (g.left <= 1 || Game.Rules.airtight(g.c, g.notes, g.c.culprit)) break; if (g.notes.some(n => n.by === p && n.slot === 1)) continue; g.sel = p; await Game.App.ask('Where?', { k: 'a', slot: 1 }); } });
  await page.click('#btn-accuse');
  assert.equal(await page.$$eval('#dlg [data-accuse]', els => els.length), 5);
  await page.click(`#dlg [data-accuse="${c.culprit}"]`);
  await idle(page);
  g = await st(page);
  assert.equal(g.over.correct, true);
  assert.equal(g.over.airtight, true);
  assert.ok(g.over.stars >= 2);
  const rev = await page.textContent('#reveal');
  assert.match(rev, /Airtight/);
  assert.match(rev, /It was \w+ \w+\. /);
  assert.match(rev, /The shortest way through: \d/);
  assert.match(rev, /What they were thinking/);
  assert.equal(await page.$$eval('#proved li[data-clear="1"]', els => els.length), 4, 'each of the other four was put in the clear');
  assert.equal(await page.$$eval('#line li', els => els.length), c.min);
  assert.equal(await page.textContent(`#strip .who[data-id="${c.culprit}"] .who-tag`), 'did it');
  await page.click('dialog .row .btn >> nth=0');
  assert.equal(await page.$('#btn-accuse'), null);
  assert.ok(await page.$('#btn-next'));
  assert.deepEqual(await overflowReport(page, 375), []);
  // The first screen: tonight's case is closed, with the result to copy, and the casebook has it.
  await page.click('#btn-quit');
  assert.equal(await page.isHidden('#btn-daily'), true);
  assert.match(await page.textContent('#daily-line'), /Airtight, in \d+ questions? \(the shortest way was \d\)\. The next one is tomorrow night\./);
  assert.match(await page.textContent('#book-line'), /^1 case, 1 right, 1 airtight$/);
  assert.match(await page.textContent('#book-people'), /In the chair most: .*guilty 1/);
  const share = await page.evaluate(() => { const R = Game.Rules; const b = Game.Book.read(); return R.shareText('2026-11-19', b.daily['2026-11-19']); });
  assert.match(share, /^Lock-In · 2026-11-19\n★★[★☆] Airtight in \d+ questions \(shortest way: \d\)$/);
  await page.click('#btn-share');
  await page.waitForFunction(() => document.querySelector('#share-note').textContent !== '');
  // And it is still closed after a reload, and tomorrow there is another.
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(() => { Game.App.now = () => new Date(2026, 10, 19, 23, 0, 0); Game.UI.home(); });
  assert.equal(await page.isHidden('#btn-daily'), true);
  await page.evaluate(() => { Game.App.now = () => new Date(2026, 10, 21, 9, 0, 0); Game.UI.home(); });
  assert.equal(await page.isHidden('#btn-daily'), false);
  assert.match(await page.textContent('#daily-line'), /^Nobody's talking\./, 'a hard one at the weekend');
});

s.test('proof moves a liar and a bluff does not: said in the player\'s own words, a lie is given up only when the notebook holds what proves it', async h => {
  const page = await open(h);
  await sit(page, { seed: 5, level: 2 });
  const c = (await st(page)).c;
  const liar = c.people.find(p => p !== c.culprit && c.story[p][1].lie);
  await page.evaluate(async liar => { const g = Game.state; g.sel = liar; await Game.App.ask('Where?', { k: 'a', slot: 1 }); await Game.App.ask('You are lying to me. I know you were not there.'); }, liar);
  let g = await st(page);
  assert.deepEqual(g.caught, [], 'a bluff with nothing behind it');
  assert.equal(g.left, c.budget - 2, 'which still costs a question');
  assert.match((await logText(page)).pop(), /You have nothing that says otherwise\./);
  // Now with the proof in the notebook, the same words do it.
  const by = await page.evaluate(async liar => {
    const R = Game.Rules, g = Game.state, c = g.c; const find = () => g.notes.find(n => R.conflicts(n, liar, c.story[liar][1]));
    for (const p of [Game.HOST].concat(c.people)) { if (find()) break; if (p === liar) continue; g.sel = p; await Game.App.ask('Where?', { k: 'a', slot: 1 }); }
    const n = find(); g.sel = liar; await Game.App.ask(`${Game.CAST.find(x => x.id === n.by).name.split(' ')[0]} says you were not there. You are lying.`);
    return n.by;
  }, liar);
  g = await st(page);
  assert.deepEqual(g.caught, [liar]);
  assert.ok(by);
  const last = (await logText(page)).filter(l => l.startsWith(liar)).pop();
  assert.match(last, /^\S+: All right\. I was not /);
  // The truth they tell names who they were really with, which is what puts that one in the clear.
  const truth = g.c.T[liar][1];
  assert.ok(await page.evaluate(([liar, truth]) => { const n = Game.state.notes.find(x => x.by === liar && x.slot === 1 && x.ver === 1); return n.place === truth && n.true === true; }, [liar, truth]));
  // The guilty one, caught out, only changes the story: still a lie, and nobody's proof.
  const guilty = await page.evaluate(async () => {
    const R = Game.Rules, A = Game.App; A.speed = 0;
    for (let seed = 1; seed < 60; seed++) {
      A.newCase({ seed, level: 1, mode: 'demo' }); document.getElementById('dlg').close();
      const g = Game.state, c = g.c; if (c.shape !== 'A') continue;
      g.sel = Game.HOST; await A.ask('Where?', { k: 'a', slot: 1 });
      for (const p of c.people) { if (p === c.culprit) continue; g.sel = p; await A.ask('Where?', { k: 'a', slot: 1 }); }
      const n = g.notes.find(x => R.conflicts(x, c.culprit, c.story[c.culprit][1]));
      g.sel = c.culprit; await A.put(R.noteId(n));
      const now = g.notes.find(x => x.by === c.culprit && x.slot === 1 && x.ver === 1);
      return { caught: g.caught.includes(c.culprit), alone: now.with.length === 0, isTrue: now.true, cleared: !!R.clearedBy(c, g.notes, c.culprit), text: g.log.filter(e => e.t === 'say').pop().text };
    }
    return null;
  });
  assert.deepEqual({ caught: guilty.caught, alone: guilty.alone, isTrue: guilty.isTrue, cleared: guilty.cleared }, { caught: true, alone: true, isTrue: false, cleared: false });
  assert.match(guilty.text, /^Fine\. I was not .* on my own, (getting some air|looking for something to eat|watching the cards)\. That is not a crime\.$/);
});

s.test('the wrong one, and a hunch: no stars and the run broken for naming an innocent one, one star for the right one unproved, and each has something to say', async h => {
  const page = await open(h);
  await sit(page, { seed: 9, level: 1 });
  let c = (await st(page)).c;
  const innocent = c.people.find(p => p !== c.culprit);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-accuse');
  await page.click(`#dlg [data-accuse="${innocent}"]`);
  await idle(page);
  let g = await st(page);
  assert.deepEqual([g.over.correct, g.over.airtight, g.over.stars], [false, false, 0]);
  let log = await logText(page);
  assert.match(log[log.length - 1], /^\[bad\] Wrong\. It was .*, who has just walked out of the door\.$/);
  assert.ok(log.some(l => l.startsWith(`${innocent}: `)), 'the one wrongly named answers');
  assert.ok(log.some(l => l.startsWith(`${c.culprit}: `)), 'and the guilty one has a word on the way out');
  assert.match(await page.textContent('#reveal'), /The wrong one/);
  assert.match(await page.textContent('#reveal'), /You named /);
  assert.equal(await page.$$eval('#proved li[data-clear="0"]', els => els.length), 3, 'nothing was proved');
  // Next case, from the reveal: named right with an empty notebook.
  await page.click('dialog .btn.primary');
  c = (await st(page)).c;
  await page.click('dialog .btn.primary');
  assert.equal(c.level, 1, 'another as hard as the last');
  await page.evaluate(id => Game.App.accuse(id), c.culprit);
  await idle(page);
  g = await st(page);
  assert.deepEqual([g.over.correct, g.over.airtight, g.over.stars], [true, false, 1]);
  assert.match(await page.textContent('#reveal'), /Right, on a hunch/);
  const b = await page.evaluate(() => Game.Book.read());
  assert.deepEqual([b.cases, b.right, b.tight, b.stars, b.streak], [2, 1, 0, 1, 1]);
  assert.equal(await page.evaluate(() => window.localStorage.getItem('novatria.lockin')), null, 'a closed case is not kept to come back to');
});

s.test('the questions run out: the box and the buttons stop, the room says so, and there is still one to name; a case left open is picked up where it was', async h => {
  const page = await open(h);
  await sit(page, { seed: 3, level: 1 });
  const c = (await st(page)).c;
  await page.evaluate(async () => { const g = Game.state; g.sel = g.c.people[0]; while (g.left > 1) await Game.App.ask('Did you do it?'); });
  assert.equal(await page.getAttribute('#tb-left', 'data-low'), '1');
  // Leave with one question left, and come back.
  await page.click('#btn-quit');
  await page.click('dialog .btn.primary');
  assert.equal(await page.isHidden('#home-continue-row'), false);
  assert.match(await page.textContent('#home-continue-note'), /· 1 question left$/);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-continue');
  let g = await st(page);
  assert.equal(g.left, 1);
  assert.equal(g.asked, c.budget - 1);
  assert.equal(await page.$$eval('#log .say', els => els.length), (c.budget - 1) * 2, 'the talk is as it was');
  await page.click('#chips .chip >> nth=0');
  await idle(page);
  g = await st(page);
  assert.equal(g.left, 0);
  assert.match((await logText(page)).pop(), /^\[end\] That is all the questions you get\./);
  assert.equal(await page.isDisabled('#say'), true);
  assert.equal(await page.isDisabled('#btn-say'), true);
  assert.ok(await page.$$eval('#chips .chip', els => els.every(b => b.disabled)));
  await page.evaluate(() => Game.App.ask('One more?'));
  assert.equal((await st(page)).asked, c.budget, 'nothing more is asked');
  await page.click('#btn-accuse');
  await page.click(`#dlg [data-accuse="${c.culprit}"]`);
  await idle(page);
  assert.equal((await st(page)).over.correct, true);
});

s.test('who has been in the chair before: the casebook keeps each of them, the sheet says so the next time, and that person is told what happened', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, level: 1 });
  const c = (await st(page)).c;
  const wronged = c.people.find(p => p !== c.culprit);
  await page.evaluate(id => Game.App.accuse(id), wronged);
  await idle(page);
  const b = await page.evaluate(() => Game.Book.read().people);
  assert.equal(Object.keys(b).length, 4);
  assert.equal(b[c.culprit].guilty, 1);
  assert.match(b[c.culprit].last, /they named somebody else\. You walked out\./);
  assert.match(b[wronged].last, /you had done nothing, and they named you anyway\./);
  // The same room again (the same seed): each of them remembers.
  await sit(page, { seed: 21, level: 1 });
  await page.click(`#strip .who[data-id="${wronged}"]`);
  assert.match(await page.textContent('#sheet .sheet-role'), / · in the chair once before$/);
  await page.click(`#strip .who[data-id="${c.culprit}"]`);
  assert.match(await page.textContent('#sheet .sheet-role'), / · in the chair once before, guilty once$/);
  const seat = await page.evaluate(id => Game.Prompts.seat(id), wronged);
  assert.match(seat, /You have been questioned by this detective before\. Last time you had done nothing, and they named you anyway\./);
  // A manner is the person's own, the same every night.
  assert.ok(await page.evaluate(() => Game.CAST.every(p => Game.mannerOf(p.id) === Game.mannerOf(p.id)) && new Set(Game.CAST.map(p => Game.mannerOf(p.id)[0])).size === Game.MANNERS.length));
});

s.test('what the scripted room makes of a typed question: the time asked about, a sighting, another person, a denial, pressure, and nothing it can answer', async h => {
  const page = await open(h);
  await sit(page, { seed: 5, level: 2 });
  const out = await page.evaluate(() => {
    const g = Game.state, c = g.c; const p = c.people[0]; const q = c.people[1]; const name = Game.CAST.find(x => x.id === q).name.split(' ')[0];
    const r = t => { const x = Game.Bots.read(p, t); return x.k + (x.slot === undefined ? '' : x.slot) + (x.about ? ':other' : ''); };
    c.times = ['half past nine', 'ten'];
    return [r('Where were you at ten?'), r('where were you at half past nine'), r('and at 9:30?'), r('What about 10pm'), r('Where were you?'), r('where were you earlier'), r('Walk me through your night'),
      r('Did you see anyone near the office?'), r('who do you think did it'), r(`What can you tell me about ${name}?`), r(`Was ${name} with you at ten?`), r('Did you do it?'), r('You are lying'), r(`${name} says you weren't there`), r('Nice weather')];
  });
  assert.deepEqual(out, ['a1', 'a0', 'a0', 'a1', 'a1', 'a0', 'a1', 'p', 'p', 'g:other', 'a1:other', 'deny', 'press', 'press:other', 'none']);
  // Half past ten is not ten.
  assert.deepEqual(await page.evaluate(() => { const c = Game.state.c; c.times = ['ten', 'half past ten']; return [Game.Bots.slots('at half past ten?', c), Game.Bots.slots('at ten?', c), Game.Bots.slots('10:30', c), Game.Bots.slots('ten and half past ten', c).sort()]; }), [[1], [0], [1], [0, 1]]);
});

s.test('with Claude: one call for one person, told their own account and nobody else\'s; what they say they told goes in the notebook; a lie is given up only when there is proof', async h => {
  const bodies = [];
  let reply = () => ({});
  const page = await open(h, { route: standIn(bodies, { reply: (user, body) => reply(user, body) }) });
  await page.evaluate(() => { window.sessionStorage.setItem('novatria.apiKey', 'sk-ant-test'); Game.App.speed = 0; Game.App.newCase({ seed: 5, level: 2, mode: 'claude', model: 'claude-sonnet-5-5' }); document.getElementById('dlg').close(); });
  const c = (await st(page)).c;
  const liar = c.people.find(p => p !== c.culprit && c.story[p][1].lie);
  const honest = c.people.find(p => p !== c.culprit && !c.story[p][1].lie);
  // An honest person, asked where they were: the request, and what they are told.
  reply = () => ({ say: 'At the bar. *shrugs* "That is all."', told: ['[a1]', 'a9', 'p'], cracked: true, aside: 'Why me.' });
  await page.click(`#strip .who[data-id="${honest}"]`);
  await page.fill('#say', 'Where were you when it happened?');
  await page.click('#btn-say');
  await idle(page);
  assert.equal(bodies.length, 1, 'one call');
  const { body, headers } = bodies[0];
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(headers['x-api-key'], 'sk-ant-test');
  assert.equal(headers['anthropic-version'], '2026-10-21');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.output_config.format.schema.required, ['say', 'told', 'cracked', 'aside']);
  // (The live API refuses a call that asks a model what it is "thinking": the line each of them mutters is asked for as an aside.)
  assert.doesNotMatch(body.system[0].text + JSON.stringify(body.output_config), /thinking/i);
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system']);
  let user = body.messages[0].content.map(x => x.text).join('\n');
  assert.match(user, /You did not do it, and you do not know who did\./);
  assert.doesNotMatch(user, /YOU DID IT|THIS IS A LIE/, 'an honest person is told of no lie, theirs or anyone\'s');
  assert.match(user, /\[a0\] Around .*\(True\.\)\n\[a1\] At .*\(True\.\)/);
  assert.match(user, /CAUGHT OUT\nNothing\./);
  assert.match(user, /THE DETECTIVE NOW SAYS: Where were you when it happened\?$/);
  let g = await st(page);
  assert.deepEqual(g.notes, [`a|${honest}|1|0`], 'only what is theirs to tell is noted, by its id');
  assert.deepEqual(g.caught, [], 'and saying "cracked" with no lie to give up changes nothing');
  assert.equal((await logText(page)).filter(l => l.startsWith(honest)).pop(), `${honest}: At the bar. "That is all."`, 'the reply is shown without its stage directions');
  assert.match(await page.textContent('#cost'), /^claude-sonnet-5-5 · 1 call · \$0\.00[0-9] · key …test$/, 'and the line under the box says which key');
  // The liar: told their lie, the truth and why; holds while there is no proof, whatever the model says.
  reply = () => ({ say: 'Fine, you have me.', told: [], cracked: true });
  await page.click(`#strip .who[data-id="${liar}"]`);
  await page.fill('#say', 'I know you are lying.');
  await page.click('#btn-say');
  await idle(page);
  user = bodies[1].body.messages[0].content.map(x => x.text).join('\n');
  assert.match(user, /\[a1\] At .* you SAY you were .*THIS IS A LIE\. The truth, which you keep to yourself: you were .*Why you lie: /);
  assert.doesNotMatch(user, /YOU DID IT/);
  assert.match(user, /CAUGHT OUT\nNothing\. The detective cannot prove any lie of yours/);
  assert.deepEqual((await st(page)).caught, []);
  // With proof in the notebook the person is told what the detective holds, and may give it up.
  reply = user => (/behind the bar/.test(user) ? { say: 'Here is who I had.', told: ['a1'] } : { say: 'I was with them.', told: ['a1'] });
  await page.evaluate(async liar => { const R = Game.Rules, g = Game.state, c = g.c; const find = () => g.notes.find(n => R.conflicts(n, liar, c.story[liar][1])); for (const p of [Game.HOST].concat(c.people)) { if (find()) break; if (p === liar || p === c.culprit) continue; g.sel = p; await Game.App.ask('Where were you at the time?'); } g.sel = liar; Game.UI.render(); }, liar);
  bodies.length = 0;
  reply = () => ({ say: 'All right. I was somewhere else.', told: [], cracked: true, aside: 'There it goes.' });
  await page.fill('#say', 'They tell me you were not there.');
  await page.click('#btn-say');
  await idle(page);
  user = bodies[0].body.messages[0].content.map(x => x.text).join('\n');
  assert.match(user, /CAUGHT OUT\nAbout .*: the detective has been told, ".*" If the detective puts that to you, .* give it up: say that you were .*, and why you lied \(".*"\)\. Then list \[a1\] in "told" and set "cracked" to true\./);
  assert.match(user, /THE QUESTIONING SO FAR \(you and the detective\)\nDetective: I know you are lying\.\nYou: Fine, you have me\./, 'their own questioning so far, and nobody else\'s');
  g = await st(page);
  assert.deepEqual(g.caught, [liar]);
  assert.ok(g.notes.includes(`a|${liar}|1|1`), 'the truth goes in the notebook whether or not the model listed it');
  assert.equal(await page.evaluate(id => Game.state.thoughts[id], liar), 'There it goes.');
  // The guilty one: told they did it, and never to confess. Named, they get a last word (a call of its own).
  bodies.length = 0;
  reply = () => ({ say: 'On my own, out back.', told: ['a1'] });
  await page.click(`#strip .who[data-id="${c.culprit}"]`);
  await page.click('#chips .chip >> nth=0');
  await idle(page);
  user = bodies[0].body.messages[0].content.map(x => x.text).join('\n');
  assert.match(user, /YOU DID IT: you .*\. Nobody saw you\. You never confess\./);
  assert.match(user, /What is said of you around town, and it is true: .* That is why you did it\./, 'the reason is the case\'s own');
  assert.match(bodies[0].body.system[0].text, /One time of the evening to an answer, never two\./);
  assert.match(user, /The truth, which you keep to yourself: you were .*, alone, doing it\./);
  bodies.length = 0;
  await page.evaluate(id => Game.App.accuse(id), c.culprit);
  await idle(page);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].body.output_config.format.schema.required, ['say']);
  assert.match(bodies[0].body.messages[0].content[1].text, /^The detective has named you, and they are right\./);
  assert.equal((await logText(page)).filter(l => l.startsWith(c.culprit)).pop(), `${c.culprit}: Well. There it is.`);
});

s.test('with Claude, something put to a liar that proves the lie: they are told to give it up now, and it is given up whatever comes back; a call that fails is answered from the script, and the case goes on', async h => {
  const bodies = [];
  const opts = { reply: () => ({ say: 'I have nothing to add.', told: [], cracked: false }) };
  const page = await open(h, { route: (route) => standIn(bodies, opts)(route) });
  await page.evaluate(() => { window.sessionStorage.setItem('novatria.apiKey', 'sk-ant-test'); Game.App.speed = 0; Game.App.newCase({ seed: 5, level: 2, mode: 'claude' }); document.getElementById('dlg').close(); });
  const c = (await st(page)).c;
  const liar = c.people.find(p => p !== c.culprit && c.story[p][1].lie);
  opts.reply = () => ({ say: 'This is where I was.', told: ['a1'] });
  const proof = await page.evaluate(async liar => { const R = Game.Rules, g = Game.state, c = g.c; const find = () => g.notes.find(n => R.conflicts(n, liar, c.story[liar][1])); for (const p of [Game.HOST].concat(c.people)) { if (find()) break; if (p === liar || p === c.culprit) continue; g.sel = p; await Game.App.ask('Where were you at the time?'); } g.sel = liar; Game.UI.render(); return R.noteId(find()); }, liar);
  bodies.length = 0;
  opts.reply = () => ({ say: 'I have nothing to add.', told: [], cracked: false });
  await page.click('#chips .chip[data-chip="put"]');
  await page.click(`#notes [data-put="${proof}"]`);
  await idle(page);
  const user = bodies[0].body.messages[0].content.map(x => x.text).join('\n');
  assert.match(user, /CAUGHT OUT\nThe detective has just put proof to you that you were not where you said at .*\. Give it up now: say that you were /);
  assert.match(user, /THE DETECTIVE PUTS THIS TO YOU, from their notes: ".* says .*"$/);
  let g = await st(page);
  assert.deepEqual(g.caught, [liar], 'the code holds them to it');
  assert.ok(g.notes.includes(`a|${liar}|1|1`));
  // The API goes down: the script answers, one line says so, and the count and the notebook go on.
  opts.fail = true;
  const before = g.notes.length;
  const other = c.people.find(p => p !== liar && !g.notes.some(n => n.startsWith(`a|${p}|0|`)));
  await page.click(`#strip .who[data-id="${other}"]`);
  await page.click('#chips .chip >> nth=1');
  await idle(page);
  await page.click('#chips .chip >> nth=1');
  await idle(page);
  g = await st(page);
  assert.equal(g.notes.length, before + 1, 'the scripted answer is noted like any other');
  const log = await logText(page);
  assert.equal(log.filter(l => /^\[notice\] A call to Claude failed \(the stand-in is down\), so that answer came from the script\. The case goes on\.$/.test(l)).length, 1, 'said once');
  assert.match(await page.textContent('#cost'), /· 2 not answered by Claude · key …test$/);
});

s.test('a key Anthropic refuses is never answered for by the script: the page says which key it sent and where it had it from, takes another in place, and asks the question again with nothing spent', async h => {
  // (The owner, with a key that worked and a case the script was answering: "why no claude call?", "IT'S THE SAME KEY i gave you so it should be working". This browser had kept an older one, and nothing said so.)
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { badKey: 'sk-ant-old-one-7777', reply: () => ({ say: 'Here is who I had.', told: ['a1'] }) }) });
  await page.evaluate(() => { window.localStorage.setItem('novatria.apiKey', 'sk-ant-old-one-7777'); Game.App.speed = 0; Game.UI.home(); });
  // The first screen says whose key it is before a case is opened.
  await page.click('#home-set summary');
  await page.click('#f-mode [data-v="claude"]');
  assert.equal(await page.textContent('#who-note'), 'Claude plays them, with the key ending …7777 (remembered on this device). Change it under “Who plays them”.');
  assert.equal(await page.getAttribute('#f-key', 'placeholder'), 'Using the key ending …7777 (type here to use another)');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  const c = (await st(page)).c;
  await page.click('#chips .chip >> nth=0');
  await page.waitForSelector('#key-ask');
  let g = await st(page);
  assert.equal(await page.textContent('#dlg-title'), 'The API key was refused');
  assert.match(await page.textContent('#key-ask'), /Anthropic refused the key this page sent \(“invalid x-api-key”\)\. It was the key ending …7777 \(remembered on this device\)\./);
  assert.deepEqual([g.left, g.asked, g.notes.length], [c.budget, 0, 0], 'nothing is spent and nothing is noted');
  assert.equal(await page.$$eval('#log .say', els => els.length), 0, 'and nobody has answered: not Claude, and not the script in its place');
  assert.equal(await page.isChecked('#dlg-keep'), true, 'a remembered key is replaced unless the player says not');
  // Nothing typed is not a key.
  await page.click('dialog .btn.primary');
  assert.match(await page.textContent('#key-ask .err'), /Paste a key first\./);
  // The right key: the same question is asked again, by Claude this time.
  await page.fill('#dlg-key', '  sk-ant-new-one-1234 ');
  await page.click('dialog .btn.primary');
  await idle(page);
  g = await st(page);
  assert.deepEqual([g.left, g.asked, g.notes], [c.budget - 1, 1, ['a|npc_loretta|1|0']]);
  assert.deepEqual(bodies.map(b => b.headers['x-api-key']), ['sk-ant-old-one-7777', 'sk-ant-new-one-1234'], 'the same question, sent again with the new key');
  assert.equal((await logText(page)).filter(l => l.startsWith('npc_loretta')).pop(), 'npc_loretta: Here is who I had.');
  assert.match(await page.textContent('#cost'), /· 1 call · .* · 1 not answered by Claude · key …1234$/);
  assert.equal(await page.evaluate(() => window.localStorage.getItem('novatria.apiKey')), 'sk-ant-new-one-1234', 'remembered in place of the old one');
  assert.equal((await logText(page)).filter(l => /^\[notice\]/.test(l)).length, 0);
});

s.test('a case played by Claude with no key on the page (a new tab, a key that was only ever typed): asked for before anything is spent; or the case is played from the script, knowingly', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { reply: () => ({ say: 'Here is who I had.', told: ['a1'] }) }) });
  await page.click('#home-set summary');
  await page.click('#f-mode [data-v="claude"]');
  assert.match(await page.textContent('#who-note'), /^Claude plays them, once there is a key/);
  await page.fill('#f-key', 'sk-ant-typed-5555');
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  const c = (await st(page)).c;
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('novatria.apiKey')), 'sk-ant-typed-5555', 'a typed key is kept for the tab');
  assert.equal(await page.evaluate(() => window.localStorage.getItem('novatria.apiKey')), null, 'and not on the device unless asked');
  // A reload in the same tab keeps it: the case goes on with Claude.
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(() => { Game.App.speed = 0; });
  assert.equal(await page.textContent('#who-note'), 'Claude plays them, with the key ending …5555 (kept for this tab). Change it under “Who plays them”.');
  await page.click('#btn-continue');
  await page.click('#chips .chip >> nth=0');
  await idle(page);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].headers['x-api-key'], 'sk-ant-typed-5555');
  // The tab's key gone (as in a new tab): the next question asks for one first.
  await page.evaluate(() => { window.sessionStorage.removeItem('novatria.apiKey'); });
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-continue');
  assert.match(await page.textContent('#cost'), /· no key$/);
  await page.click('#chips .chip >> nth=1');
  await page.waitForSelector('#key-ask');
  assert.equal(await page.textContent('#dlg-title'), 'No API key');
  assert.equal((await st(page)).left, c.budget - 1, 'nothing spent');
  assert.deepEqual(await overflowReport(page, 375), []);
  const box = await page.evaluate(() => { const r = document.getElementById('dlg').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; });
  assert.ok(box[0] >= 0 && box[1] <= 375 && box[2] >= 0 && box[3] <= 740, 'the ask fits a phone');
  // Without one: this case from the script, by the player's own choice, and it says so.
  await page.click('dialog .row .btn >> nth=0');
  await idle(page);
  const g = await st(page);
  assert.equal(g.left, c.budget - 2);
  assert.equal(await page.evaluate(() => Game.state.mode), 'demo');
  assert.equal(await page.textContent('#cost'), 'Scripted: no key, no calls');
  assert.equal(bodies.length, 1, 'no call was made');
});

s.test('from the first screen: Claude is asked for a key before a case opens, and with one the case opens with Claude; the choice is kept', async h => {
  const page = await open(h, { route: standIn([], {}) });
  await page.click('#home-set summary');
  await page.click('#f-mode [data-v="claude"]');
  assert.equal(await page.isVisible('#f-key'), true);
  await page.click('#btn-new');
  assert.match(await page.textContent('#home-err'), /Paste an Anthropic API key/);
  assert.equal(await page.evaluate(() => Game.state), null);
  await page.fill('#f-key', 'sk-ant-typed');
  await page.selectOption('#f-model', 'claude-haiku-5-5');
  await page.click('#f-level [data-v="3"]');
  assert.match(await page.textContent('#level-help'), /^Six in the room/);
  await page.click('#btn-new');
  const g = await page.evaluate(() => ({ mode: Game.state.mode, model: Game.state.model, level: Game.state.c.level, n: Game.state.c.people.length, budget: Game.state.c.budget }));
  assert.deepEqual(g, { mode: 'claude', model: 'claude-haiku-5-5', level: 3, n: 6, budget: 11 });
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(window.localStorage)), /sk-ant-typed/, 'the key is not kept on the device unless the box is ticked');
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#f-mode [aria-pressed="true"]').dataset.v, document.querySelector('#f-model').value, document.querySelector('#f-level [aria-pressed="true"]').dataset.v]), ['claude', 'claude-haiku-5-5', '3']);
});

s.test('a phone, narrow and short: six in the room and Loretta fit one row, nothing runs off the side, and every dialog stays on the screen', async h => {
  for (const vp of [{ width: 320, height: 568 }, { width: 375, height: 740 }, { width: 412, height: 915 }]) {
    const page = await open(h, { viewport: vp });
    assert.deepEqual(await overflowReport(page, vp.width), [], `home at ${vp.width}`);
    await page.evaluate(() => { Game.App.speed = 0; Game.App.newCase({ seed: 2, level: 3, mode: 'demo' }); });
    const inside = async what => { const r = await page.evaluate(() => { const b = document.getElementById('dlg').getBoundingClientRect(); return [b.left, b.right, b.top, b.bottom]; }); assert.ok(r[0] >= 0 && r[1] <= vp.width && r[2] >= 0 && r[3] <= vp.height, `${what} at ${vp.width}x${vp.height}: ${r}`); };
    await inside('the briefing');
    await page.click('dialog .btn.primary');
    assert.deepEqual(await overflowReport(page, vp.width), [], `the case at ${vp.width}`);
    const row = await page.$$eval('#strip .who', els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    assert.equal(row.length, 7);
    assert.equal(new Set(row).size, 1, 'one row of faces');
    await page.evaluate(async () => { const g = Game.state; for (const p of [Game.HOST].concat(g.c.people)) { g.sel = p; await Game.App.ask('Where?', { k: 'a', slot: 1 }); } g.sel = g.c.people[0]; Game.UI.render(); });
    assert.deepEqual(await overflowReport(page, vp.width), [], `the talk at ${vp.width}`);
    const composer = await page.evaluate(() => { const r = document.getElementById('composer').getBoundingClientRect(); return [r.top, r.bottom]; });
    assert.ok(composer[1] <= vp.height + 1, 'the box is on the screen');
    await page.click('#btn-notes');
    assert.deepEqual(await overflowReport(page, vp.width), [], `the notes at ${vp.width}`);
    assert.ok(await page.evaluate(() => { const n = document.getElementById('notes'); return n.scrollWidth <= n.clientWidth + 1; }), 'the notes do not scroll sideways');
    assert.equal(await page.$$eval('#nt-grid tbody tr', els => els.length), 7);
    await page.click('#btn-notes');
    await page.click('#chips .chip >> text=Tell me about');
    await inside('who to ask about');
    await page.click('dialog .row .btn');
    await page.click('#btn-accuse');
    await inside('who did it');
    const c = await page.evaluate(() => Game.state.c.culprit);
    await page.click(`#dlg [data-accuse="${c}"]`);
    await idle(page);
    await inside('the reveal');
    assert.ok(await page.evaluate(() => { const r = document.getElementById('reveal'); return r.scrollWidth <= r.clientWidth + 1; }), 'the reveal does not scroll sideways');
  }
});

s.test('on a wide screen the notes sit beside the talk and fill in as people answer: no button to open them, nothing to count', async h => {
  const page = await open(h, { viewport: { width: 1280, height: 800 } });
  await sit(page, { seed: 5, level: 2 });
  assert.equal(await page.isVisible('#btn-notes'), false);
  assert.equal(await page.isVisible('#notes'), true);
  assert.equal(await page.isVisible('#log-wrap'), true);
  const boxes = await page.evaluate(() => ['log-wrap', 'notes'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }));
  assert.ok(boxes[0][1] <= boxes[1][0] && boxes[1][1] <= 1280, `side by side: ${JSON.stringify(boxes)}`);
  assert.equal(await page.$$eval('#nt-grid .nt-none', els => els.length), 12, 'nothing asked yet: every square says so');
  await page.click('#chips .chip >> nth=0');
  await idle(page);
  assert.equal(await page.$$eval('#nt-grid .nt-none', els => els.length), 11, 'one answer, one square');
  const c = (await st(page)).c;
  await page.click(`#strip .who[data-id="${c.people[0]}"]`);
  assert.match(await page.textContent('#nt-put'), /^Put it to \w+$/);
  assert.equal(await page.$$eval('#notes [data-put]', els => els.length), 1, 'what Loretta said can be put to them from there');
  await page.click('#notes [data-put]');
  await idle(page);
  assert.equal((await st(page)).asked, 2);
  assert.deepEqual(await overflowReport(page, 1280), []);
});

s.test('one self-contained file: no innerHTML, no markup from strings, one fetch (to the API), nothing loaded from elsewhere', async () => {
  const html = fs.readFileSync(FILE, 'utf8');
  assert.doesNotMatch(html, /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write(ln)?\s*\(/);
  const fetches = [...html.matchAll(/\bfetch\s*\(([^,)]*)/g)].map(m => m[1].trim());
  assert.deepEqual(fetches, ['ENDPOINT']);
  assert.match(html, /const ENDPOINT = 'https:\/\/api\.anthropic\.com\/v1\/messages';/);
  assert.doesNotMatch(html, /<(script|link|img|iframe)\b[^>]*\b(src|href)=["']https?:/i, 'no script, stylesheet, image or frame from another host');
  assert.doesNotMatch(html, /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new Worker)\b/);
  assert.match(html, /connect-src https:\/\/api\.anthropic\.com;/, 'and the page\'s policy allows no other host');
  assert.doesNotMatch(html, /temperature|top_p|top_k|tool_choice|budget_tokens/, 'nothing the API refuses is sent');
  // The people and their faces are Last Call's own, word for word: the two pages draw the same fifty.
  const other = fs.readFileSync(path.resolve(__dirname, '..', 'lastcall.html'), 'utf8');
  const cast = t => /<script type="application\/json" id="cast">(.*)<\/script>/.exec(t)[1];
  assert.equal(cast(html), cast(other));
});

s.run();
