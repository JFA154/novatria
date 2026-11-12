'use strict';
/* Last Call (lastcall.html): the hidden-role game at the Low Water (the
   owner: "i always wanted a game like traitors or werewolf, but people are
   so ding dongs sometimes if playing online. A game powered by claude? I'm
   in"). The code owns the roles, the nights, the votes and who wins; each
   other seat is one Claude call told only what that person knows, or the
   scripted table (the offline demo, and any seat whose call failed).
   Covered here: the page alone from file:// with the network shut; the
   deal by size and the role asked for; who has won; a whole scripted game
   through the buttons; the Witness, the Watch turning the Knives away and
   a tied vote; the Claude path against a stand-in API (the request's
   shape, what each seat is and is not told, the cost line, a failed call
   falling back to the script); the player out (every role shown, Skip to
   the end with no calls); a reload; phone widths; no innerHTML and one
   fetch. Run with: node tests/run.cjs lastcall */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const FILE = path.resolve(__dirname, '..', 'lastcall.html');
const URL = 'file://' + FILE;
const s = suite('lastcall');
const open = (h, opts) => h.open(Object.assign({ url: URL, consent: false, viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
const idle = page => page.waitForFunction(() => !Game.busy);
const sit = async (page, opts) => {
  await page.evaluate(o => { Game.App.speed = 0; Game.App.newGame(Object.assign({ seed: 11, size: 8, mode: 'demo', name: 'Joe' }, o)); }, opts || {});
  await page.click('dialog .btn.primary');
};
const st = page => page.evaluate(() => { const g = Game.state; return { phase: g.phase, day: g.day, beat: g.beat, winner: g.winner, me: g.players[0], players: g.players.map(p => ({ id: p.id, first: p.first, role: p.role, alive: p.alive, out: p.out })) }; });
const sysLines = page => page.evaluate(() => Game.state.log.filter(e => e.t === 'sys').map(e => e.text));
/* A stand-in for the API: answers each call with JSON of the shape asked for, naming someone still in who is not the seat itself (nor its fellow Knife). */
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
    if (opts && opts.fail) return route.fulfill({ status: 500, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'the stand-in is down' } }) });
    const need = body.output_config.format.schema.required;
    const user = body.messages[0].content.map(c => c.text).join('\n');
    const still = (/STILL IN: (.*)\./.exec(user) || [])[1].split(', ');
    const me = (/YOUR SEAT: (\S+)/.exec(user) || [])[1];
    const other = still.find(n => n !== me && !new RegExp(`fellow Kni(?:fe|ves): [^.]*${n}`).test(user));
    const out = need.includes('vote') ? { vote: other, say: `${other}. I have my reasons.`, note: `voted ${other}` }
      : need.includes('take') && need.includes('say') ? { take: other, say: `Take ${other}. Too sharp by half.` }
        : need.includes('take') ? { take: other, note: `took ${other}` }
          : { say: `${other}, you were by the back door when the lights went. Explain that.`, about: other, stance: 'accuse', suspect: other, trust: null, note: `pressing ${other}` };
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) });
  };
}

s.test('the page stands alone: it opens from file:// with the network shut, the cast is the town\'s adults, every face draws, and the first screen offers a table', async h => {
  const page = await open(h);
  const home = await page.evaluate(() => {
    for (const c of Game.CAST) Game.faceNode(c);
    return { title: document.title, active: document.querySelector('.screen.active').id, cast: Game.CAST.length, young: Game.CAST.filter(c => !(c.age >= 21)).length, firsts: new Set(Game.CAST.map(c => c.name.split(' ')[0])).size,
      mode: document.querySelector('#f-mode [aria-pressed="true"]').dataset.v, keyShown: !document.querySelector('#claude-fields').hidden, cont: document.querySelector('#home-continue-row').hidden };
  });
  assert.deepEqual([home.title, home.active, home.mode, home.keyShown, home.cont], ['Last Call', 'screen-home', 'claude', true, true]);
  assert.ok(home.cast >= 30 && home.young === 0, 'the town\'s adults only: ' + JSON.stringify(home));
  assert.equal(home.firsts, home.cast, 'no two share a first name');
  // Claude with no key is refused with a line; the offline demo sits down.
  await page.click('#btn-new');
  assert.match(await page.textContent('#home-err'), /^Paste an Anthropic API key/);
  await page.click('#f-mode [data-v="demo"]');
  assert.equal(await page.evaluate(() => document.querySelector('#claude-fields').hidden), true);
  await page.click('#btn-new');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.evaluate(() => Game.state.mode), 'demo');
});

s.test('the deal: the roles by size (one Knife at 6, two and a Watch at 8, three at 10), a Witness always, the role asked for given, the same seed the same table, and nobody with the player\'s name', async h => {
  const page = await open(h);
  const out = await page.evaluate(() => {
    const count = (st, r) => st.players.filter(p => p.role === r).length;
    const R = Game.Rules;
    const res = {};
    for (const size of [6, 8, 10]) { const g = R.deal({ seed: 5, size, mode: 'demo' }); res[size] = [g.players.length, count(g, 'knife'), count(g, 'witness'), count(g, 'watch'), count(g, 'town'), g.players[0].you, new Set(g.players.map(p => p.first)).size]; }
    res.asked = ['town', 'knife', 'witness', 'watch'].map(role => R.deal({ seed: 9, size: 8, role }).players[0].role);
    res.noWatch = R.deal({ seed: 9, size: 6, role: 'watch' }).players[0].role;
    res.same = JSON.stringify(R.deal({ seed: 42, size: 8 }).players.map(p => [p.id, p.role])) === JSON.stringify(R.deal({ seed: 42, size: 8 }).players.map(p => [p.id, p.role]));
    res.other = JSON.stringify(R.deal({ seed: 42, size: 8 }).players.map(p => p.id)) !== JSON.stringify(R.deal({ seed: 43, size: 8 }).players.map(p => p.id));
    res.named = R.deal({ seed: 3, size: 10, name: 'Curtis' }).players.filter(p => p.first === 'Curtis').length;
    res.win = [
      R.winner([{ alive: true, role: 'town' }, { alive: true, role: 'town' }, { alive: false, role: 'knife' }]),
      R.winner([{ alive: true, role: 'town' }, { alive: true, role: 'knife' }]),
      R.winner([{ alive: true, role: 'town' }, { alive: true, role: 'witness' }, { alive: true, role: 'knife' }]),
      R.winner([{ alive: true, role: 'town' }, { alive: true, role: 'watch' }, { alive: true, role: 'knife' }, { alive: true, role: 'knife' }])
    ];
    return res;
  });
  assert.deepEqual(out[6], [6, 1, 1, 0, 4, true, 6]);
  assert.deepEqual(out[8], [8, 2, 1, 1, 4, true, 8]);
  assert.deepEqual(out[10], [10, 3, 1, 1, 5, true, 10]);
  assert.deepEqual(out.asked, ['town', 'knife', 'witness', 'watch']);
  assert.notEqual(out.noWatch, 'watch', 'no Watch at six seats, so it is not dealt');
  assert.ok(out.same && out.other, 'seeded');
  assert.equal(out.named, 1, 'only the player is called that');
  assert.deepEqual(out.win, ['town', 'knives', null, 'knives']);
});

s.test('a whole scripted game through the buttons: the role card, each night, the talk, each vote one per seat still in, and an ending the rules agree with', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, role: 'town' });
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Town');
  await page.click('#mid-go');
  await idle(page);
  let votesSeen = 0;
  for (let i = 0; i < 80; i++) {
    const g = await st(page);
    if (g.phase === 'over') break;
    if (g.phase === 'night') { await page.click('#mid-go'); await idle(page); }
    else if (g.phase === 'talk') {
      if (g.me.alive && g.beat === 0) { await page.fill('#say', 'Somebody here is lying to me.'); await page.click('#btn-say'); await idle(page); }
      else if (g.beat < 2) { await page.click('#btn-pass'); await idle(page); }
      else await page.click('#btn-vote');
    } else if (g.phase === 'vote') {
      const aliveBefore = g.players.filter(p => p.alive).length;
      if (g.me.alive) await page.click(`.seat[data-id="${g.players.find(p => p.alive && p.id !== 'you').id}"]`);
      await page.click('#mid-go');
      await idle(page);
      const votes = await page.evaluate(d => Game.state.log.filter(e => e.kind === 'vote' && e.day === d).length, g.day);
      assert.equal(votes, aliveBefore, `day ${g.day}: one vote for each seat still in`);
      votesSeen += 1;
    }
  }
  const end = await st(page);
  assert.equal(end.phase, 'over');
  assert.ok(votesSeen >= 1);
  const knivesIn = end.players.filter(p => p.alive && p.role === 'knife').length;
  const othersIn = end.players.filter(p => p.alive && p.role !== 'knife').length;
  assert.equal(end.winner, knivesIn === 0 ? 'town' : 'knives');
  if (end.winner === 'knives') assert.ok(knivesIn >= othersIn);
  const page2 = await page.evaluate(() => ({ mid: document.querySelector('#mid .mid-t').textContent, tags: [...document.querySelectorAll('.seat .seat-tag')].map(t => t.textContent), last: Game.state.log[Game.state.log.length - 1].text }));
  assert.match(page2.mid, /^(Town wins|The Knives win)$/);
  assert.ok(page2.tags.every(t => ['Town', 'Knife', 'Witness', 'Watch'].includes(t)), 'every role is on the table at the end: ' + page2.tags.join(','));
  assert.match(page2.last, /^(Town wins\. Every Knife is out: |The Knives win: )/);
});

s.test('the Witness learns what is true, the Watch turns the Knives away, and a tied vote puts nobody out', async h => {
  const page = await open(h);
  // The Witness.
  await sit(page, { seed: 31, role: 'witness' });
  await page.click('#mid-go');
  await idle(page);
  const knife = await page.evaluate(() => { const k = Game.state.players.find(p => p.role === 'knife'); Game.Bots.kill = () => Game.state.players.find(p => p.alive && !p.you && p.role === 'town'); return { id: k.id, name: k.name, first: k.first }; });
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Tap who you watch tonight.');
  await page.click(`.seat[data-id="${knife.id}"]`);
  assert.equal(await page.textContent('#mid-go'), `Watch ${knife.first}`);
  await page.click('#mid-go');
  await idle(page);
  assert.ok((await sysLines(page)).includes(`You watched ${knife.name} in the night. ${knife.first} is a Knife.`));
  assert.equal(await page.evaluate(id => document.querySelector(`.seat[data-id="${id}"] .seat-tag`).textContent, knife.id), 'Knife', 'and it stays on their seat');
  assert.equal(await page.evaluate(() => Game.recordText().includes('You watched')), false, 'what the Witness saw is not in the record the others are given');
  // The Watch.
  await sit(page, { seed: 32, role: 'watch' });
  await page.click('#mid-go');
  await idle(page);
  const ward = await page.evaluate(() => { const t = Game.state.players.find(p => !p.you && p.role === 'town'); Game.Bots.kill = () => t; return t.id; });
  await page.click(`.seat[data-id="${ward}"]`);
  await page.click('#mid-go');
  await idle(page);
  const lines = await sysLines(page);
  assert.ok(lines.includes('Morning. Someone came for one of you in the night and was turned away. Everyone is still here.'), lines.join(' | '));
  assert.equal((await st(page)).players.filter(p => !p.alive).length, 0);
  // A tie.
  const pair = await page.evaluate(() => {
    const live = Game.state.players.filter(p => p.alive && !p.you);
    const a = live[0]; const b = live[1];
    Game.Bots.vote = p => ({ vote: p === a ? b : (live.indexOf(p) % 2 ? a : b), text: 'There.' });
    return { a: a.id, b: b.id, n: live.length + 1 };
  });
  await page.click('#btn-vote');
  // Seven others: a votes b; of the other six, three for a and three for b gives b four and a three, so the player's vote for a ties it.
  await page.click(`.seat[data-id="${pair.a}"]`);
  await page.click('#mid-go');
  await idle(page);
  const after = await sysLines(page);
  assert.ok(after.some(l => /A tie between .* \(4 each\), so nobody is put out\.$/.test(l)), after.slice(-3).join(' | '));
  assert.equal((await st(page)).players.filter(p => !p.alive).length, 0);
  assert.equal((await st(page)).phase, 'night');
});

s.test('with Claude at the seats: the request is the API\'s own shape, each seat is told only what it would know, the cost is shown, and what comes back is said, voted and done', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await page.click('#mid-go');
  await idle(page);
  const mate = await page.evaluate(() => Game.state.players.find(p => p.role === 'knife' && !p.you));
  assert.equal(bodies.length, 1, 'the night opens with the fellow Knife\'s whisper');
  assert.ok(await page.evaluate(() => Game.state.log.some(e => e.kind === 'whisper' && e.priv)), 'which is private');
  const prey = await page.evaluate(() => Game.state.players.find(p => p.alive && p.role !== 'knife').id);
  await page.click(`.seat[data-id="${prey}"]`);
  await page.click('#mid-go');
  await idle(page);
  await page.fill('#say', 'I was at the bar all night. Who saw anything?');
  await page.click('#btn-say');
  await idle(page);
  const said = await page.evaluate(() => Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk').map(e => [e.who, e.text]));
  assert.equal(said[0][0], 'you');
  assert.ok(said.length >= 3 && said.slice(1).every(x => /you were by the back door when the lights went/.test(x[1])), 'what Claude sent back is what is said');
  // The request.
  const first = bodies[0];
  assert.deepEqual([first.headers['x-api-key'], first.headers['anthropic-version'], first.headers['anthropic-dangerous-direct-browser-access']], ['sk-ant-test-key', '2026-10-21', 'true']);
  for (const b of bodies) {
    assert.deepEqual(Object.keys(b.body).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system']);
    assert.equal(b.body.model, 'claude-opus-5-5');
    assert.equal(b.body.output_config.format.type, 'json_schema');
    assert.equal(b.body.output_config.format.schema.additionalProperties, false);
    assert.deepEqual(b.body.system[0].cache_control, { type: 'ephemeral' });
    assert.equal(b.body.messages.length, 1);
    assert.equal(b.body.messages[0].role, 'user');
  }
  // What each seat is told.
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const talk = bodies.filter(b => b.body.output_config.format.schema.required.includes('stance'));
  const town = talk.find(b => /YOUR SECRET ROLE: (Town|Witness|Watch)/.test(userOf(b)));
  const knife = talk.find(b => /YOUR SECRET ROLE: Knife/.test(userOf(b)));
  assert.ok(town, 'someone of the Town spoke');
  assert.doesNotMatch(userOf(town), /fellow Kni|The Knives took|whisper|Too sharp by half/i, 'a Town seat is told nothing of the Knives');
  assert.doesNotMatch(town.body.system[0].text, /YOUR SECRET ROLE|Your fellow Kni|The Knives took/, 'and the shared rules name nobody\'s role');
  assert.match(userOf(town), /^Joe: "I was at the bar all night\. Who saw anything\?"$/m, 'the player is in the record by name, as anyone is');
  if (knife) assert.match(userOf(knife), /YOUR SECRET ROLE: Knife\. Your fellow Knife: Joe\./);
  assert.match(bodies[0].body.system[0].text, new RegExp(`- ${mate.name} \\(\\d+, [^)]+\\)\\. Voice: `), 'each seat\'s voice is the town\'s own');
  // The vote.
  await page.click('#btn-vote');
  const target = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you && p.role !== 'knife').id);
  await page.click(`.seat[data-id="${target}"]`);
  await page.click('#mid-go');
  await idle(page);
  const votes = bodies.filter(b => b.body.output_config.format.schema.required.includes('vote'));
  assert.equal(votes.length, 6, 'each other seat still in votes in a call of its own');
  const cost = await page.textContent('#cost');
  assert.match(cost, /^claude-opus-5-5 · \d+ calls · about \$0\.\d{3}$/);
  assert.equal(await page.evaluate(() => Game.state.usage.failed), 0);
});

s.test('a call that fails costs the game nothing: that seat plays from the script, one line says so, and the key never reaches the page\'s text or the save', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { fail: true }) });
  await page.fill('#f-key', 'sk-ant-secret-key');
  await page.click('#f-role [data-v="town"]');
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await page.click('#mid-go');
  await idle(page);
  await page.click('#mid-go');
  await idle(page);
  if ((await st(page)).me.alive) { await page.fill('#say', 'Well?'); await page.click('#btn-say'); } else await page.click('#btn-pass');
  await idle(page);
  const out = await page.evaluate(() => ({ notices: Game.state.log.filter(e => e.kind === 'notice' && /failed/.test(e.text)).map(e => e.text), talk: Game.state.log.filter(e => e.t === 'say' && e.who !== 'you').length, failed: Game.state.usage.failed, save: window.localStorage.getItem('novatria.lastcall'), text: document.body.textContent }));
  assert.ok(bodies.length >= 2, 'the calls were made');
  assert.equal(out.notices.length, 1, 'said once');
  assert.match(out.notices[0], /^A call to Claude failed \(the stand-in is down\), so that seat played from its script\. The game goes on\.$/);
  assert.ok(out.talk >= 2 && out.failed >= 2, 'and the table still talks');
  assert.equal(out.save.includes('sk-ant-secret-key'), false, 'the key is not in the save');
  assert.equal(out.text.includes('sk-ant-secret-key'), false);
});

s.test('out of the game the player sees every role, can watch or skip to the end with no call, and a table left is picked up again', async h => {
  const page = await open(h);
  await sit(page, { seed: 41, role: 'town' });
  await page.click('#mid-go');
  await idle(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.find(p => p.you && p.alive) || Game.state.players.find(p => p.alive && p.role !== 'knife'); });
  await page.click('#mid-go');
  await idle(page);
  let g = await st(page);
  assert.equal(g.me.alive, false);
  assert.ok((await sysLines(page)).includes('Morning. You were taken in the night. You were Town.'));
  assert.equal(await page.evaluate(() => Game.recordText().includes('Morning. Joe was taken in the night. Joe was Town.')), true, 'the record names the player');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.seat .seat-tag')].every(t => t.textContent)), 'every role is shown to the one who is out');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#acts .btn')].map(b => b.textContent)), ['Watch them talk', 'Go to the vote', 'Skip to the end']);
  assert.equal(await page.evaluate(() => document.querySelector('#say-line').hidden), true, 'the dead do not talk');
  // Leave and come back.
  await page.click('#btn-quit');
  await page.click('dialog .btn.primary');
  assert.equal(await page.evaluate(() => document.querySelector('#home-continue-row').hidden), false);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.match(await page.textContent('#home-continue-note'), /^Joe, Town · Day 1 · 7 still in$/);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#log > *').length), await page.evaluate(() => Game.state.log.length), 'the story so far is drawn again');
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-skip');
  await idle(page);
  g = await st(page);
  assert.equal(g.phase, 'over');
  assert.ok(['town', 'knives'].includes(g.winner));
});

for (const [name, vp] of [['375', PHONE], ['320', { width: 320, height: 568 }], ['a laptop', LAPTOP]]) {
  s.test(`at ${name}: nothing wider than the screen on the first screen, at night, in the talk with a seat picked and at the vote; every button is 44px`, async h => {
    const page = await open(h, { viewport: vp });
    const w = vp.width;
    const small = () => page.evaluate(() => [...document.querySelectorAll('#app button, #app .input, #app a.btn')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5).map(b => `${b.id || b.className} ${Math.round(b.getBoundingClientRect().height)}`));
    assert.deepEqual(await overflowReport(page, w), [], 'the first screen');
    assert.deepEqual(await small(), [], 'the first screen\'s buttons');
    await sit(page, { seed: 51, size: 10, role: 'town' });
    await page.click('#mid-go');
    await idle(page);
    assert.deepEqual(await overflowReport(page, w), [], 'night');
    await page.click('#mid-go');
    await idle(page);
    const other = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id);
    await page.click(`.seat[data-id="${other}"]`);
    assert.deepEqual(await overflowReport(page, w), [], 'the talk, a seat picked');
    assert.deepEqual(await small(), [], 'the game\'s buttons');
    const seats = await page.evaluate(() => { const t = document.querySelector('#table').getBoundingClientRect(); return [...document.querySelectorAll('.seat')].map(s => { const r = s.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1 && r.width >= 44 && r.height >= 44 && r.top >= t.top - 60; }); });
    assert.ok(seats.length === 10 && seats.every(Boolean), 'ten seats, each on screen and big enough to tap');
    if ((await st(page)).me.alive) { await page.fill('#say', 'Hm.'); await page.click('#btn-say'); await idle(page); }
    await page.click('#btn-vote');
    assert.deepEqual(await overflowReport(page, w), [], 'the vote');
  });
}

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
});

s.run();
