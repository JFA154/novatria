'use strict';
/* Last Call (index.html, the front page): the hidden-role game at the Low
   Water (the owner: "i always wanted a game like traitors or werewolf, but
   people are so ding dongs sometimes if playing online. A game powered by
   claude? I'm in"; then "let's start with table only for now, but make it
   entertaining like how the werewolf game is"). The code owns the roles,
   the nights, the votes and who wins; each other seat is one Claude call
   told only what that person knows, or the scripted table (the offline
   demo, and any seat whose call failed).
   Covered here: the page alone from file:// with the network shut; the
   deal by size, the wild cards and the role asked for; who has won; a
   whole scripted game through the buttons, with the host's lines and the
   reveal at the end; the Witness, the Watch turning the Knives away and a
   tied vote; last words (a seat's and the player's), the Fool winning by
   the vote, the Hothead taking someone along (a seat's choice and the
   player's); the Claude path against a stand-in API (the request's shape,
   what each seat is and is not told, the host told only what is public,
   the cost line, a failed call falling back to the script); the player
   out (every role shown, Skip to the end with no calls); a reload; phone
   widths; no innerHTML and one fetch. Run with: node tests/run.cjs lastcall */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const FILE = path.resolve(__dirname, '..', 'index.html');
const URL = 'file://' + FILE;
const s = suite('lastcall');
const open = (h, opts) => h.open(Object.assign({ url: URL, consent: false, viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
/* Wait for the step to end, answering what the table asks the player on the way: no last words, and the first seat that can be picked (opts.words, opts.seat give other answers). */
const settle = async (page, opts) => {
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => !Game.busy || !!Game.waiting);
    const w = await page.evaluate(() => (Game.busy ? Game.waiting : null));
    if (!w) return;
    if (w === 'line') { if (opts && opts.words) { await page.fill('#say', opts.words); await page.click('#btn-say'); } else await page.click('#btn-nothing'); }
    else {
      const id = (opts && opts.seat) || await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id);
      await page.click(`.seat[data-id="${id}"]`);
      await page.click('#mid-go');
    }
  }
  throw new Error('the step never settled');
};
const sit = async (page, opts) => {
  await page.evaluate(o => { Game.App.speed = 0; Game.App.quiet = true; Game.App.newGame(Object.assign({ seed: 11, size: 8, mode: 'demo', name: 'Joe' }, o)); }, opts || {});
  await page.click('dialog .btn.primary');
};
const begin = async page => { await page.click('#mid-go'); await settle(page); };
/* Let the table talk a round without the player: Pass beside the empty box (still in), or Watch them talk (out). */
const pass = async page => { if (await page.$('#btn-pass')) await page.click('#btn-pass'); else { await page.fill('#say', ''); await page.click('#btn-say'); } await settle(page); };
const st = page => page.evaluate(() => { const g = Game.state; return { phase: g.phase, day: g.day, beat: g.beat, winner: g.winner, me: g.players[0], players: g.players.map(p => ({ id: p.id, first: p.first, name: p.name, role: p.role, alive: p.alive, out: p.out })) }; });
const sysLines = (page, kind) => page.evaluate(k => Game.state.log.filter(e => e.t === 'sys' && (!k || e.kind === k)).map(e => e.text), kind || null);
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
    const host = /^You are the host/.test(body.system[0].text);
    const still = ((/STILL IN: (.*)\./.exec(user) || [])[1] || '').split(', ');
    const me = (/YOUR SEAT: (\S+)/.exec(user) || [])[1];
    const other = still.find(n => n !== me && !new RegExp(`fellow Kni(?:fe|ves): [^.]*${n}`).test(user));
    const room = need.includes('reactions') ? [...body.system[0].text.matchAll(/^- (\w+):/gm)].map(m => m[1]) : null;
    const out = room ? { reactions: [{ name: room[0], say: 'Ha!' }, { name: room[1], say: 'Oh, come on now, really, honestly, you cannot possibly mean that at all' }] }
      : host ? { say: 'The generator coughs twice and the room goes dark.' }
      : need.includes('vote') ? { vote: other, say: `${other}. I have my reasons.`, note: `voted ${other}` }
        : need.includes('take') && need.includes('say') ? { take: other, say: `Take ${other}. Too sharp by half.` }
          : need.includes('take') ? { take: other, note: `took ${other}` }
            : need.length === 1 ? { say: 'You will all be sorry by morning.' }
              : { say: `${other}, you were by the back door when the lights went. Explain that.`, about: other, stance: 'accuse', suspect: other, trust: null, note: `pressing ${other}` };
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) });
  };
}

s.test('the page stands alone: it opens from file:// with the network shut, the cast is the town\'s adults, every face draws, and the first screen offers a table', async h => {
  const page = await open(h);
  const home = await page.evaluate(() => {
    for (const c of Game.CAST) Game.faceNode(c);
    return { title: document.title, active: document.querySelector('.screen.active').id, cast: Game.CAST.length, young: Game.CAST.filter(c => !(c.age >= 21)).length, firsts: new Set(Game.CAST.map(c => c.name.split(' ')[0])).size,
      mode: document.querySelector('#f-mode [aria-pressed="true"]').dataset.v, wild: document.querySelector('#f-wild [aria-pressed="true"]').dataset.v, keyShown: !document.querySelector('#claude-fields').hidden, cont: document.querySelector('#home-continue-row').hidden,
      links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')) };
  });
  assert.deepEqual([home.title, home.active, home.mode, home.wild, home.keyShown, home.cont], ['Last Call', 'screen-home', 'claude', 'on', true, true]);
  assert.ok(home.cast >= 30 && home.young === 0, 'the town\'s adults only: ' + JSON.stringify(home));
  assert.equal(home.firsts, home.cast, 'no two share a first name');
  assert.deepEqual(home.links, [], 'the town game is not linked from here (it is kept beside it, hidden for now)');
  // Claude with no key is refused with a line; the offline demo sits down.
  await page.click('#btn-new');
  assert.match(await page.textContent('#home-err'), /^Paste an Anthropic API key/);
  await page.click('#f-mode [data-v="demo"]');
  assert.equal(await page.evaluate(() => document.querySelector('#claude-fields').hidden), true);
  await page.click('#btn-new');
  await page.waitForSelector('#screen-game.active');
  assert.deepEqual(await page.evaluate(() => [Game.state.mode, Game.state.wild, Game.state.players.length]), ['demo', true, 8]);
});

s.test('the deal: the roles by size, the wild cards at eight and ten unless the table is set without them, the role asked for given, the same seed the same table, and nobody with the player\'s name', async h => {
  const page = await open(h);
  const out = await page.evaluate(() => {
    const R = Game.Rules;
    const count = g => ['knife', 'witness', 'watch', 'fool', 'hothead', 'town'].map(r => g.players.filter(p => p.role === r).length);
    const res = { wild: {}, plain: {} };
    for (const size of [6, 8, 10]) { res.wild[size] = count(R.deal({ seed: 5, size, mode: 'demo' })); res.plain[size] = count(R.deal({ seed: 5, size, mode: 'demo', wild: false })); }
    res.shape = (() => { const g = R.deal({ seed: 5, size: 8 }); return [g.players.length, g.players[0].you, new Set(g.players.map(p => p.first)).size, g.wild]; })();
    res.asked = ['town', 'knife', 'witness', 'watch', 'fool'].map(role => R.deal({ seed: 9, size: 8, role }).players[0].role);
    res.hothead = R.deal({ seed: 9, size: 10, role: 'hothead' }).players[0].role;
    res.notDealt = [R.deal({ seed: 9, size: 6, role: 'watch' }).players[0].role, R.deal({ seed: 9, size: 8, role: 'fool', wild: false }).players[0].role];
    res.same = JSON.stringify(R.deal({ seed: 42, size: 8 }).players.map(p => [p.id, p.role])) === JSON.stringify(R.deal({ seed: 42, size: 8 }).players.map(p => [p.id, p.role]));
    res.other = JSON.stringify(R.deal({ seed: 42, size: 8 }).players.map(p => p.id)) !== JSON.stringify(R.deal({ seed: 43, size: 8 }).players.map(p => p.id));
    res.named = R.deal({ seed: 3, size: 10, name: 'Curtis' }).players.filter(p => p.first === 'Curtis').length;
    res.win = [
      R.winner([{ alive: true, role: 'town' }, { alive: true, role: 'town' }, { alive: false, role: 'knife' }]),
      R.winner([{ alive: true, role: 'town' }, { alive: true, role: 'knife' }]),
      R.winner([{ alive: true, role: 'town' }, { alive: true, role: 'witness' }, { alive: true, role: 'knife' }]),
      R.winner([{ alive: true, role: 'fool' }, { alive: true, role: 'hothead' }, { alive: true, role: 'knife' }, { alive: true, role: 'knife' }])
    ];
    return res;
  });
  //                     knife witness watch fool hothead town
  assert.deepEqual(out.wild, { 6: [1, 1, 0, 0, 0, 4], 8: [2, 1, 1, 1, 0, 3], 10: [3, 1, 1, 1, 1, 3] });
  assert.deepEqual(out.plain, { 6: [1, 1, 0, 0, 0, 4], 8: [2, 1, 1, 0, 0, 4], 10: [3, 1, 1, 0, 0, 5] });
  assert.deepEqual(out.shape, [8, true, 8, true]);
  assert.deepEqual(out.asked, ['town', 'knife', 'witness', 'watch', 'fool']);
  assert.equal(out.hothead, 'hothead');
  assert.ok(out.notDealt[0] !== 'watch' && out.notDealt[1] !== 'fool', 'a role the table does not have is not dealt');
  assert.ok(out.same && out.other, 'seeded');
  assert.equal(out.named, 1, 'only the player is called that');
  assert.deepEqual(out.win, ['town', 'knives', null, 'knives'], 'the Fool and the Hothead count with everyone else against the Knives');
});

s.test('a whole scripted game through the buttons: the role card, the host at each turn of it, each vote one per seat still in, an ending the rules agree with, and the reveal', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, role: 'town' });
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Town');
  await begin(page);
  let votesSeen = 0;
  for (let i = 0; i < 80; i++) {
    const g = await st(page);
    if (g.phase === 'over') break;
    if (g.phase === 'night') { await page.click('#mid-go'); await settle(page); }
    else if (g.phase === 'talk') {
      if (g.me.alive && g.beat === 0) { await page.fill('#say', 'Somebody here is lying to me.'); await page.click('#btn-say'); await settle(page); }
      else if (g.beat < 2) await pass(page);
      else await page.click('#btn-vote');
    } else if (g.phase === 'vote') {
      const aliveBefore = g.players.filter(p => p.alive).length;
      if (g.me.alive) await page.click(`.seat[data-id="${g.players.find(p => p.alive && p.id !== 'you').id}"]`);
      await page.click('#mid-go');
      await settle(page);
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
  const fool = end.players.find(p => p.role === 'fool');
  if (end.winner === 'fool') assert.deepEqual([fool.alive, fool.out.how], [false, 'vote']);
  else { assert.equal(end.winner, knivesIn === 0 ? 'town' : 'knives'); if (end.winner === 'knives') assert.ok(knivesIn >= othersIn); }
  const shown = await page.evaluate(() => ({ mid: document.querySelector('#mid .mid-t').textContent, tags: [...document.querySelectorAll('.seat .seat-tag')].map(t => t.textContent), last: Game.state.log[Game.state.log.length - 1].text,
    host: Game.state.log.filter(e => e.kind === 'host').length, record: Game.recordText(), hostText: Game.state.log.filter(e => e.kind === 'host').map(e => e.text) }));
  assert.match(shown.mid, /^(Town wins|The Knives win|The Fool wins)$/);
  assert.ok(shown.tags.every(t => ['Town', 'Knife', 'Witness', 'Watch', 'Fool', 'Hothead'].includes(t)), 'every role is on the table at the end: ' + shown.tags.join(','));
  assert.match(shown.last, /^(Town wins\. Every Knife is out: |The Knives win: |The Fool wins\. )/);
  assert.ok(shown.host >= 3, 'the host speaks at each night, morning and vote');
  assert.ok(shown.hostText.every(t => !shown.record.includes(t)), 'and what the host says is colour: it is never in the record a seat is given');
  // The reveal: every role, how each went and how each voted.
  await page.click('#mid-reveal');
  const rows = await page.evaluate(() => [...document.querySelectorAll('dialog .reveal-row')].map(r => ({ role: r.dataset.role, name: r.querySelector('.reveal-name').textContent, fate: r.querySelector('.reveal-fate').textContent })));
  assert.equal(rows.length, 8);
  assert.equal(rows[0].role, 'knife', 'the Knives first');
  assert.ok(rows.every(r => /^(In at the end|Voted out, day \d|Taken in the night, day \d|Taken by the Hothead, day \d)/.test(r.fate)), JSON.stringify(rows.map(r => r.fate)));
  assert.ok(rows.some(r => / · voted \w+/.test(r.fate)), 'who each voted for');
});

s.test('the Witness learns what is true, the Watch turns the Knives away, and a tied vote puts nobody out', async h => {
  const page = await open(h);
  // The Witness.
  await sit(page, { seed: 31, role: 'witness' });
  await begin(page);
  const knife = await page.evaluate(() => { const k = Game.state.players.find(p => p.role === 'knife'); Game.Bots.kill = () => Game.state.players.find(p => p.alive && !p.you && p.role === 'town'); return { id: k.id, name: k.name, first: k.first }; });
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Tap who you watch tonight.');
  await page.click(`.seat[data-id="${knife.id}"]`);
  assert.equal(await page.textContent('#mid-go'), `Watch ${knife.first}`);
  await page.click('#mid-go');
  await settle(page);
  assert.ok((await sysLines(page)).includes(`You watched ${knife.name} in the night. ${knife.first} is a Knife.`));
  assert.equal(await page.evaluate(id => document.querySelector(`.seat[data-id="${id}"] .seat-tag`).textContent, knife.id), 'Knife', 'and it stays on their seat');
  assert.equal(await page.evaluate(() => Game.recordText().includes('You watched')), false, 'what the Witness saw is not in the record the others are given');
  // The Watch.
  await sit(page, { seed: 32, role: 'watch' });
  await begin(page);
  const ward = await page.evaluate(() => { const t = Game.state.players.find(p => !p.you && p.role === 'town'); Game.Bots.kill = () => t; return t.id; });
  await page.click(`.seat[data-id="${ward}"]`);
  await page.click('#mid-go');
  await settle(page);
  const lines = await sysLines(page);
  assert.ok(lines.includes('Someone came for one of you in the night and was turned away. Everyone is still here.'), lines.join(' | '));
  assert.match(await page.evaluate(() => Game.recordText()), /^Morning\. Someone came for one of you in the night and was turned away\. Everyone is still here\.$/m);
  assert.equal((await st(page)).players.filter(p => !p.alive).length, 0);
  // A tie.
  const pair = await page.evaluate(() => {
    const live = Game.state.players.filter(p => p.alive && !p.you);
    const a = live[0]; const b = live[1];
    Game.Bots.vote = p => ({ vote: p === a ? b : (live.indexOf(p) % 2 ? a : b), text: 'There.' });
    return { a: a.id, b: b.id };
  });
  await page.click('#btn-vote');
  // Seven others: a votes b; of the other six, three for a and three for b gives b four and a three, so the player's vote for a ties it.
  await page.click(`.seat[data-id="${pair.a}"]`);
  await page.click('#mid-go');
  await settle(page);
  const after = await sysLines(page);
  assert.ok(after.some(l => /A tie between .* \(4 each\), so nobody is put out\.$/.test(l)), after.slice(-3).join(' | '));
  assert.equal((await st(page)).players.filter(p => !p.alive).length, 0);
  assert.equal((await st(page)).phase, 'night');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#table .arrows').length), 0, 'the pointing is cleared once the vote is done');
});

s.test('last words come before the role is shown: a seat\'s own, then the player\'s, typed or not', async h => {
  const page = await open(h);
  await sit(page, { seed: 61, role: 'town', wild: false });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
  await page.click('#mid-go');
  await settle(page);
  // Everyone votes one Town seat out.
  const mark = await page.evaluate(() => { const t = Game.state.players.find(p => p.alive && !p.you && p.role === 'town'); const o = Game.state.players.find(p => p.alive && !p.you && p !== t); Game.Bots.vote = p => ({ vote: p === t ? o : t, text: 'There.' }); return { id: t.id, first: t.first, name: t.name }; });
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${mark.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  const log = await page.evaluate(() => Game.state.log.map(e => [e.kind, e.who || '', e.text]));
  const last = log.findIndex(e => e[0] === 'last');
  const ban = log.findIndex(e => e[0] === 'banish');
  assert.ok(last > 0 && last < ban, 'said before the role is shown');
  assert.equal(log[last][1], mark.id);
  assert.match(log[ban][2], new RegExp(`${mark.name} is put out with \\d votes\\. ${mark.first} was Town\\.$`));
  assert.match(await page.evaluate(() => Game.recordText()), new RegExp(`^${mark.first} \\(last words\\): "`, 'm'), 'and it is in the record, for the seats to weigh');
  // The next day the table turns on the player, who is asked.
  await page.evaluate(() => { Game.Bots.vote = () => ({ vote: Game.state.players[0], text: 'The stranger.' }); });
  await page.click('#mid-go');
  await settle(page);
  await page.click('#btn-vote');
  const other = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id);
  await page.click(`.seat[data-id="${other}"]`);
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.waiting === 'line');
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#mid .mid-t').textContent, document.querySelector('#say').placeholder, !!document.querySelector('#btn-nothing')]), ['Any last words?', 'Any last words?', true]);
  await page.fill('#say', 'It is not me, and you will see it in the morning.');
  await page.click('#btn-say');
  await settle(page);
  const mine = await page.evaluate(() => Game.state.log.filter(e => e.kind === 'last' && e.who === 'you').map(e => e.text));
  assert.deepEqual(mine, ['It is not me, and you will see it in the morning.']);
  assert.equal((await st(page)).me.alive, false);
});

s.test('the Fool wins alone by the vote, and the Hothead takes someone along: a seat by its own choice, the player by theirs', async h => {
  const page = await open(h);
  const townLast = () => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); };
  // The Fool, voted out.
  await sit(page, { seed: 71, role: 'town' });
  await begin(page);
  await page.evaluate(townLast);
  await page.click('#mid-go');
  await settle(page);
  const fool = await page.evaluate(() => { const f = Game.state.players.find(p => p.role === 'fool'); const o = Game.state.players.find(p => p.alive && !p.you && p !== f); Game.Bots.vote = p => ({ vote: p === f ? o : f, text: 'Him.' }); return { id: f.id, name: f.name }; });
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${fool.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  let g = await st(page);
  assert.deepEqual([g.phase, g.winner], ['over', 'fool']);
  assert.equal((await sysLines(page, 'end'))[0], `The Fool wins. ${fool.name} wanted the vote, and the table gave it. Everyone else loses.`);
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#mid .mid-k').textContent, document.querySelector('#mid .mid-t').textContent]), ['You lost', 'The Fool wins']);
  // A seat that is the Hothead, voted out, takes whoever it chooses.
  await sit(page, { seed: 72, size: 10, role: 'town' });
  await begin(page);
  await page.evaluate(townLast);
  await page.click('#mid-go');
  await settle(page);
  const hot = await page.evaluate(() => {
    const hh = Game.state.players.find(p => p.role === 'hothead');
    const knife = Game.state.players.find(p => p.role === 'knife' && p.alive);
    const o = Game.state.players.find(p => p.alive && !p.you && p !== hh);
    Game.Bots.vote = p => ({ vote: p === hh ? o : hh, text: 'Her.' });
    Game.Bots.shot = () => knife;
    return { id: hh.id, name: hh.name, first: hh.first, knife: knife.id, knifeName: knife.name };
  });
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${hot.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  assert.deepEqual(g.players.find(p => p.id === hot.knife).out, { how: 'shot', day: 1 });
  assert.ok((await sysLines(page, 'death')).some(l => l.startsWith(`${hot.first} takes ${hot.knifeName} along. `) && l.endsWith('was a Knife.')));
  assert.match(await page.evaluate(() => Game.recordText()), new RegExp(`^${hot.name} was the Hothead and takes ${hot.knifeName} out too\\.`, 'm'));
  // The player, the Hothead, taken in the night, picks at the table.
  await sit(page, { seed: 73, size: 10, role: 'hothead' });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players[0]; });
  const target = await page.evaluate(() => Game.state.players.find(p => p.role === 'knife').id);
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.waiting === 'seat');
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'You are the Hothead. Who goes with you?');
  await page.click(`.seat[data-id="${target}"]`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  assert.deepEqual([g.me.alive, g.players.find(p => p.id === target).out.how], [false, 'shot']);
});

s.test('with Claude at the seats: the request is the API\'s own shape, each seat is told only what it would know, the host only what is public, the cost is shown, and what comes back is said, voted and done', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  const mate = await page.evaluate(() => Game.state.players.find(p => p.role === 'knife' && !p.you));
  assert.equal(bodies.length, 1, 'the night opens with the fellow Knife\'s whisper');
  assert.ok(await page.evaluate(() => Game.state.log.some(e => e.kind === 'whisper' && e.priv)), 'which is private');
  const prey = await page.evaluate(() => Game.state.players.find(p => p.alive && p.role === 'town').id);
  await page.click(`.seat[data-id="${prey}"]`);
  await page.click('#mid-go');
  await settle(page);
  await page.fill('#say', 'I was at the bar all night. Who saw anything?');
  await page.click('#btn-say');
  await settle(page);
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
  const isHost = b => /^You are the host/.test(b.body.system[0].text);
  const talk = bodies.filter(b => b.body.output_config.format.schema.required.includes('stance'));
  const town = talk.find(b => /YOUR SECRET ROLE: (Town|Witness|Watch|Fool|Hothead)/.test(userOf(b)));
  const knife = talk.find(b => /YOUR SECRET ROLE: Knife/.test(userOf(b)));
  assert.ok(town, 'someone who is not a Knife spoke');
  assert.doesNotMatch(userOf(town), /fellow Kni|The Knives took|whisper|Too sharp by half/i, 'a seat that is not a Knife is told nothing of the Knives');
  assert.doesNotMatch(town.body.system[0].text, /YOUR SECRET ROLE|Your fellow Kni|The Knives took/, 'and the shared rules name nobody\'s role');
  assert.match(userOf(town), /^Joe: "I was at the bar all night\. Who saw anything\?"$/m, 'the player is in the record by name, as anyone is');
  assert.doesNotMatch(userOf(town), /The generator coughs twice/, 'the host\'s colour is not in a seat\'s record');
  if (knife) assert.match(userOf(knife), /YOUR SECRET ROLE: Knife\. Your fellow Knife: Joe\./);
  assert.match(bodies[0].body.system[0].text, new RegExp(`^- ${mate.name} \\(\\d+\\)\\. Voice: [^\\n]+ Manner: [^\\n]+\\.$`, 'm'), 'each seat has its own way of talking');
  assert.match(bodies[0].body.system[0].text, /One person is the Fool, on nobody's side/, 'the wild cards are in the rules every seat is given');
  // The host.
  const hosts = bodies.filter(isHost);
  assert.ok(hosts.length >= 2, 'the host is asked for the night and the morning');
  for (const b of hosts) assert.doesNotMatch(userOf(b) + b.body.system[0].text, /SECRET ROLE|fellow Kni|is a Knife\b/, 'and is told nothing that is not public');
  assert.ok(await page.evaluate(() => Game.state.log.some(e => e.kind === 'host' && e.text === 'The generator coughs twice and the room goes dark.')));
  // The vote: the stand-in has every seat vote for the first name still in that is not its own, so the table goes for the player.
  await page.click('#btn-vote');
  const others = await page.evaluate(() => Game.state.players.filter(p => p.alive && !p.you).length);
  const target = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you && p.role === 'town').id);
  await page.click(`.seat[data-id="${target}"]`);
  await page.click('#mid-go');
  await settle(page, { words: 'You have the wrong one.' });
  const votes = bodies.filter(b => b.body.output_config.format.schema.required.includes('vote'));
  assert.equal(votes.length, others, 'each other seat still in votes in a call of its own');
  const cost = await page.textContent('#cost');
  assert.match(cost, /^claude-opus-5-5 · \d+ calls · about \$0\.\d{3}$/);
  assert.equal(await page.evaluate(() => Game.state.usage.failed), 0);
});

s.test('a call that fails costs the game nothing: that seat plays from the script, one line says so, and the key never reaches the page\'s text or the save', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { fail: true }) });
  await page.fill('#f-key', 'sk-ant-secret-key');
  await page.click('#f-role [data-v="town"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click('#mid-go');
  await settle(page);
  if ((await st(page)).me.alive) { await page.fill('#say', 'Well?'); await page.click('#btn-say'); await settle(page); } else await pass(page);
  const out = await page.evaluate(() => ({ notices: Game.state.log.filter(e => e.kind === 'notice' && /failed/.test(e.text)).map(e => e.text), talk: Game.state.log.filter(e => e.t === 'say' && e.who !== 'you').length, host: Game.state.log.filter(e => e.kind === 'host').length, failed: Game.state.usage.failed, save: window.localStorage.getItem('novatria.lastcall'), text: document.body.textContent }));
  assert.ok(bodies.length >= 2, 'the calls were made');
  assert.equal(out.notices.length, 1, 'said once');
  assert.match(out.notices[0], /^A call to Claude failed \(the stand-in is down\), so that seat played from its script\. The game goes on\.$/);
  assert.ok(out.talk >= 2 && out.failed >= 2 && out.host >= 2, 'and the table still talks, the host too');
  assert.equal(out.save.includes('sk-ant-secret-key'), false, 'the key is not in the save');
  assert.equal(out.text.includes('sk-ant-secret-key'), false);
});

s.test('out of the game the player sees every role, can watch or skip to the end with no call, and a table left is picked up again', async h => {
  const page = await open(h);
  await sit(page, { seed: 41, role: 'town' });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.find(p => p.you && p.alive) || Game.state.players.find(p => p.alive && p.role !== 'knife'); });
  await page.click('#mid-go');
  await settle(page);
  let g = await st(page);
  assert.equal(g.me.alive, false);
  assert.ok((await sysLines(page)).includes('You were taken in the night. You were Town.'));
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
  await settle(page);
  g = await st(page);
  assert.equal(g.phase, 'over');
  assert.ok(['town', 'knives', 'fool'].includes(g.winner));
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open] .reveal')), true, 'and the reveal opens by itself at the end');
});

s.test('what is put to the player is kept until they answer it: marked in the story, listed above the box, a mark on the asker\'s seat; tapping one aims the quick replies at them, a reply or a line naming them or setting it aside takes it off, and the vote clears the rest', async h => {
  const page = await open(h);
  await sit(page, { seed: 81, role: 'town', wild: false });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); Game.Bots.room = () => []; });
  await page.click('#mid-go');
  await settle(page);
  // Everyone who speaks puts something to the player: the first a question, the rest an accusation.
  await page.evaluate(() => { let n = 0; Game.Bots.say = p => { n += 1; const me = Game.state.players[0]; return n === 1 ? { text: `Joe, who do you make it? (${p.first})`, aim: me, stance: 'question' } : { text: `It's Joe. I'd put money on it. (${p.first})`, aim: me, stance: 'accuse' }; }; });
  await pass(page);
  const tray = () => page.evaluate(() => ({ hidden: document.querySelector('#asks').hidden, head: (document.querySelector('#asks .asks-head') || {}).textContent || null,
    rows: [...document.querySelectorAll('#asks .ask')].map(r => ({ who: r.dataset.who, kind: r.dataset.kind, label: r.querySelector('.ask-who').textContent, text: r.querySelector('.ask-text').textContent, on: r.querySelector('.ask-go').getAttribute('aria-pressed') })),
    seats: [...document.querySelectorAll('.seat[data-asking="1"]')].map(x => x.dataset.id), marked: [...document.querySelectorAll('#log .say[data-toyou="1"]')].length, tags: [...document.querySelectorAll('#log .say .to-you')].length,
    to: (document.querySelector('#chips .chips-to') || {}).textContent || null, chips: [...document.querySelectorAll('#chips .chip')].map(c => c.textContent), placeholder: document.querySelector('#say').placeholder }));
  let t = await tray();
  assert.equal(t.hidden, false);
  assert.equal(t.head, 'Waiting on you (3)');
  assert.deepEqual(t.rows.map(r => r.kind), ['asks', 'accuses', 'accuses']);
  assert.match(t.rows[0].label, /^\w+ asks you$/);
  assert.match(t.rows[0].text, /^Joe, who do you make it\?/);
  assert.deepEqual(t.seats.slice().sort(), t.rows.map(r => r.who).sort(), 'each of them has a mark on their seat');
  assert.deepEqual([t.marked, t.tags], [3, 3], 'and each line is marked "to you" in the story');
  assert.deepEqual(t.chips, ["It's you.", 'Liar.', 'Why?', "I'm with you.", 'Not me.'], 'the quick replies');
  // Tapping one aims the quick replies and the box at that person; a quick reply answers it in one tap.
  const firstWho = t.rows[0].who;
  const nameOf = id => page.evaluate(x => Game.state.players.find(p => p.id === x).first, id);
  const firstName = await nameOf(firstWho);
  await page.evaluate(() => { Game.Bots.say = p => ({ text: `Hm. (${p.first})`, aim: null, stance: 'other' }); });
  await page.click(`#asks .ask[data-who="${firstWho}"] .ask-go`);
  t = await tray();
  assert.deepEqual([t.to, t.placeholder, t.rows.find(r => r.who === firstWho).on], [`To ${firstName}:`, `Answer ${firstName}`, 'true']);
  await page.click('#chips .chip[data-chip="Not me."]');
  await settle(page);
  assert.equal(await page.evaluate(() => Game.state.log.filter(e => e.who === 'you').pop().text), `Not me, ${firstName}.`);
  t = await tray();
  assert.equal(t.head, 'Waiting on you (2)');
  assert.ok(!t.rows.some(r => r.who === firstWho));
  // A typed line that names an asker answers theirs; setting one aside takes it off too.
  const second = t.rows[0].who;
  const third = t.rows[1].who;
  await page.fill('#say', `It isn't me, ${await nameOf(second)}.`);
  assert.equal(await page.textContent('#btn-say'), 'Say', 'the button says Say once there are words');
  await page.click('#btn-say');
  await settle(page);
  t = await tray();
  assert.deepEqual(t.rows.map(r => r.who), [third]);
  await page.click(`#asks .ask[data-who="${third}"] .ask-x`);
  t = await tray();
  assert.deepEqual([t.hidden, t.rows.length, t.seats.length], [true, 0, 0]);
  assert.equal(await page.textContent('#btn-say'), 'Pass', 'and Pass with none');
  // Asked again, then the vote is called: nothing is left waiting.
  await page.evaluate(() => { Game.Bots.say = p => ({ text: `Joe, well? (${p.first})`, aim: Game.state.players[0], stance: 'question' }); });
  await pass(page);
  assert.equal((await tray()).hidden, false);
  await page.click('#btn-vote');
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#asks').hidden, Game.state.asks.length]), [true, 0]);
});

s.test('they play like people who are trying to win: each seat has a temperament (a lean, never a script), a few have a slight hunch, each is told how much to say each turn and is cut off if it goes on; the room reacts in a few words that are never evidence', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-role [data-v="town"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click('#mid-go');
  await settle(page);
  await pass(page);
  await pass(page);
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const talk = bodies.filter(b => b.body.output_config.format.schema.required.includes('stance'));
  assert.ok(talk.length >= 4);
  const sys = talk[0].body.system[0].text;
  assert.match(sys, /Play to win, the way a sharp, ordinary person plays a party game\./);
  assert.match(sys, /You are not a detective giving a summing-up, and you are not a fool or a clown either\./);
  assert.match(sys, /It is a lean, never a script: it never makes you play badly, ignore what was said, or act a part\./);
  assert.match(sys, /Short and to the point\. This is talk across a table, not a speech/);
  assert.match(sys, /never as a pet word, a pet name for people or a catchphrase\. No "heh"/);
  assert.doesNotMatch(sys, /Reason from the votes|one to three short sentences|Hold a view and say why/, 'the instructions that made them all careful and long are gone');
  assert.doesNotMatch(sys, /impulsive|often wrong|lean into it even when it is not the clever move|Never weigh the evidence|Lie plainly/, 'and so are the ones that made them play the fool');
  // Nobody's voice is a pet word to hang on every line.
  const voices = [...sys.matchAll(/^- [^\n]+ Voice: ([^\n]+) Manner: /gm)].map(m => m[1]);
  assert.ok(voices.length >= 7 && voices.every(v => !/['"\u2018\u2019\u201C\u201D]\w[^'"]*['"\u2018\u2019\u201C\u201D]|\bsugar\b|\bhon\b|ma'am|\bheh\b|\bcuz\b|\bbro\b/i.test(v.replace(/\w's\b/g, ''))), 'a manner, never a quoted catchphrase: ' + voices.join(' | '));
  const tempers = await page.evaluate(() => Game.STYLES.map(x => x.text).join(' '));
  assert.doesNotMatch(tempers, /often wrong|get details wrong|do not care|without a reason|whatever happens|probably right/, 'no temperament is a way of playing badly');
  // Each turn: a temperament, and how much to say.
  const ways = new Set();
  const lengths = new Set();
  for (const b of talk) {
    const u = userOf(b);
    const way = /^YOUR TEMPERAMENT: (.+)$/m.exec(u);
    const len = /^LENGTH THIS TURN: (.+)$/m.exec(u);
    assert.ok(way && len, 'every turn is given both');
    ways.add(way[1]);
    lengths.add(len[1]);
  }
  assert.ok(ways.size >= 2, 'they do not all play the same way');
  assert.ok([...lengths].every(l => /^(a few words: ten at most\. A fragment is fine\.|one sentence: twenty words at most\.|two short sentences: thirty-four words at most\.)$/.test(l)));
  const hunch = talk.filter(b => /^A HUNCH: you have a slight feeling about \w+, nothing solid\. It is somewhere to start; drop it the moment the table gives you something better\.$/m.test(userOf(b)));
  assert.ok(hunch.length < talk.length, 'a hunch is for a few of them, not the way the whole table thinks');
  assert.ok(talk.every(b => !/YOUR GUT TODAY|YOUR WAY OF PLAYING/.test(userOf(b))));
  const dealt = await page.evaluate(() => ({ styles: Game.state.players.filter(p => !p.you).map(p => p.style), known: Game.STYLES.map(x => x.id) }));
  assert.ok(dealt.styles.every(x => dealt.known.includes(x)));
  assert.equal(dealt.styles.filter(x => x === 'tracker').length, 1, 'one of them keeps track of the votes, and only one');
  // Cut off: whole sentences up to the limit, else at a clause.
  const cut = await page.evaluate(() => [
    Game.clip('Nah.', 8),
    Game.clip('It is you, Leon. I have watched you all night and you never once looked up, which is what a guilty man does when he thinks nobody is counting.', 8),
    Game.clip('I have watched you all night and you never once looked up from that glass, which is what a guilty man does when he thinks nobody at the table is counting', 8),
    Game.clip('One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve. Thirteen. Fourteen. Fifteen.', 8)
  ]);
  assert.equal(cut[0], 'Nah.');
  assert.equal(cut[1], 'It is you, Leon.');
  assert.ok(cut[2].endsWith('\u2026') && cut[2].split(' ').length <= 13, cut[2]);
  assert.equal(cut[3].split(' ').length, 12);
  const said = await page.evaluate(() => Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk' && e.who !== 'you').map(e => e.text.split(/\s+/).length));
  assert.ok(said.every(n => n <= 42), 'nothing said is a paragraph: ' + said.join(','));
  // The room.
  const rooms = bodies.filter(b => b.body.output_config.format.schema.required.includes('reactions'));
  assert.ok(rooms.length >= 1, 'the room is asked to react');
  assert.doesNotMatch(rooms[0].body.system[0].text + userOf(rooms[0]), /SECRET ROLE|fellow Kni|is a Knife\b/, 'and is told nobody\'s role');
  const react = await page.evaluate(() => ({ lines: Game.state.log.filter(e => e.kind === 'react').map(e => e.text), record: Game.recordText() }));
  assert.ok(react.lines.length >= 1);
  assert.match(react.lines[0], /^\w+: \u201CHa!\u201D {2}\w+: \u201COh, come on now, really, honestly\u2026\u201D$/, 'each a few words, the long one cut: ' + react.lines[0]);
  assert.ok(react.lines.every(l => !react.record.includes(l)), 'never in the record a seat is given');
});

s.test('what the player says is answered: the first seat to speak is given their words and told to answer them, the second to take them up, and a round the player passes has none of it; in the offline demo the scripted seats answer too', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  // (A Knife, so the night is the player's to decide and they are at the table in the morning.)
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.state.players.find(p => p.alive && p.role === 'town').id)}"]`);
  await page.click('#mid-go');
  await settle(page);
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const talkOf = () => bodies.filter(b => b.body.output_config.format.schema.required.includes('stance'));
  const sys = async () => { await pass(page); return talkOf()[0].body.system[0].text; };
  const s0 = await sys();
  assert.match(s0, /This is a conversation: listen to it\. What you say answers what was just said, or the person who spoke to you\./);
  assert.match(s0, /Joe is a player like any other\. Take what Joe says as seriously as anyone's: answer it, argue with it, hold them to it\./);
  assert.ok(talkOf().every(b => !/Joe has just said|Joe said a moment ago/.test(userOf(b))), 'a round the player passed has nothing of theirs to answer');
  // A line to the whole table.
  let from = talkOf().length;
  const words = "Right, it's a pain we lost the Witness on day one.";
  await page.fill('#say', words);
  await page.click('#btn-say');
  await settle(page);
  let round = talkOf().slice(from).map(userOf);
  assert.ok(round.length >= 2, 'two or three answer');
  assert.ok(round[0].includes(`Joe has just said, to the whole table: "${words}" Answer Joe: take up what they said (agree, argue with it, or answer the question), speaking to them.`), round[0].slice(-400));
  assert.ok(round[1].includes(`Joe said a moment ago: "${words}" Take that up as well, or what has been said about it since. Do not start a new subject.`), round[1].slice(-400));
  if (round[2]) assert.doesNotMatch(round[2], /Joe has just said|Joe said a moment ago/, 'the third is free to move on');
  // An answer has room to be one: never the few-words length.
  for (const u of round.slice(0, 2)) assert.doesNotMatch(/^LENGTH THIS TURN: (.+)$/m.exec(u)[1], /^a few words/);
  // A line to one of them: that one speaks first, and is told it was said to them.
  const to = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).first);
  from = talkOf().length;
  await page.fill('#say', `${to}, why so quiet?`);
  await page.click('#btn-say');
  await settle(page);
  round = talkOf().slice(from).map(userOf);
  assert.match(round[0], new RegExp(`^YOUR SEAT: ${to} `, 'm'));
  assert.ok(round[0].includes(`Joe has just said, to you: "${to}, why so quiet?" Answer Joe:`), round[0].slice(-400));
  // The scripted seats (the offline demo, a failed call) take it up too.
  const demo = await open(h);
  await sit(demo, { seed: 91, role: 'town', wild: false });
  await begin(demo);
  await demo.click('#mid-go');
  await settle(demo);
  await demo.fill('#say', 'I have no idea who it is.');
  await demo.click('#btn-say');
  await settle(demo);
  const after = await demo.evaluate(() => { const l = Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk'); const i = l.map(e => e.who).lastIndexOf('you'); return l.slice(i + 1, i + 3).map(e => e.text); });
  assert.equal(after.length, 2);
  for (const x of after) assert.match(x, /\bJoe\b|\byou\b/i, 'said to the player: ' + x);
});

s.test('typing on a phone with the keyboard up gives the room to the story and the box: the table and the quick replies step aside, and come back when the keyboard goes', async h => {
  const page = await open(h, { viewport: { width: 375, height: 740 } });
  await sit(page, { seed: 91, role: 'town', wild: false });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
  await page.click('#mid-go');
  await settle(page);
  await pass(page);
  // The keyboard comes up: the page is short and the box has the focus.
  await page.setViewportSize({ width: 375, height: 400 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.table-area')).display), 'block', 'short but not typing: the table stays (its buttons are needed)');
  await page.focus('#say');
  const short = await page.evaluate(() => ({ table: getComputedStyle(document.querySelector('.table-area')).display, log: Math.round(document.querySelector('#log-wrap').getBoundingClientRect().height), chips: getComputedStyle(document.querySelector('#chips')).display,
    box: Math.round(document.querySelector('#say').getBoundingClientRect().bottom) <= window.innerHeight }));
  assert.deepEqual([short.table, short.chips, short.box], ['none', 'none', true]);
  assert.ok(short.log >= 180, 'the story has room: ' + short.log);
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.setViewportSize({ width: 375, height: 740 });
  await page.evaluate(() => document.querySelector('#say').blur());
  const tall = await page.evaluate(() => ({ table: getComputedStyle(document.querySelector('.table-area')).display, chips: getComputedStyle(document.querySelector('#chips')).display, log: Math.round(document.querySelector('#log-wrap').getBoundingClientRect().height) }));
  assert.deepEqual([tall.table, tall.chips], ['block', 'flex']);
  assert.ok(tall.log >= 150, 'and with the keyboard down the story has its room under the table: ' + tall.log);
});

s.test('the seats are told the table is all there is: nothing about where anyone was or was going, nothing to ask the player about but how they play', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-role [data-v="town"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click('#mid-go');
  await settle(page);
  const seat = bodies.find(b => !/^You are the host/.test(b.body.system[0].text));
  const sys = seat.body.system[0].text;
  assert.match(sys, /^- Joe: one of the people at the table, the same as anyone\. There is nothing more to know about them than how they play\.$/m);
  assert.doesNotMatch(sys, /\bstranger\b|came in off|nobody here knows/i, 'nothing that makes the player someone to question about themselves');
  assert.match(sys, /The table is all there is\. The only evidence in this game is what happens at it/);
  assert.match(sys, /Where anyone was, where they were going, what they do for a living, who they are to each other and how they came to be here tell you nothing: never ask about them, never bring them up, and never make up something seen, heard or found\./);
  // No town: a seat is a name, an age, a way of talking and a manner. No job, no ties, no place.
  assert.match(sys, /Talk about the game and nothing else: this table, tonight, who is lying\. Nothing about a town \("Town" is only the name of a side in this game\), anybody's work, family, money or past, the weather, or any life outside this room/);
  const cast = await page.evaluate(() => Game.state.players.filter(p => !p.you).map(p => { const c = Game.CAST.find(x => x.id === p.id); return { name: p.name, role: c.role, voice: c.voice }; }));
  for (const c of cast) {
    assert.match(sys, new RegExp(`^- ${c.name} \\(\\d+\\)\\. Voice: `, 'm'));
    assert.equal(sys.includes(c.role), false, `${c.name}'s job in town is not given`);
    // (Lyman Coker's note in the story has nothing of the town in it, so his is the same line.)
    if (c.name !== 'Lyman Coker') assert.equal(sys.includes(c.voice), false, `nor the story's own voice note for ${c.name}, which is full of the town`);
  }
  assert.doesNotMatch(sys, /At this table:|Lockett|river|bridge|\bbar\b|Low Water/i, 'and no ties, no town, no place beyond the room');
  const host = bodies.find(b => /^You are the host/.test(b.body.system[0].text));
  assert.match(host.body.system[0].text, /nothing about a town or anyone's life outside this room/);
  assert.match(sys, /One question at a time\./);
  // The scripted table keeps to the same rule.
  const html = fs.readFileSync(FILE, 'utf8');
  assert.doesNotMatch(html.slice(html.indexOf('const Bots = {'), html.indexOf('// ----- Claude at each seat -----')), /where (they|you|I|he|she) (was|were)|last night\b.*\bwhere/i);
});

for (const [name, vp] of [['375', PHONE], ['320', { width: 320, height: 568 }], ['a laptop', LAPTOP]]) {
  s.test(`at ${name}: nothing wider than the screen on the first screen, at night, in the talk with a seat picked, at the vote and in the reveal; every button is 44px`, async h => {
    const page = await open(h, { viewport: vp });
    const w = vp.width;
    const small = () => page.evaluate(() => [...document.querySelectorAll('#app button, #app .input, #app a.btn')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5).map(b => `${b.id || b.className} ${Math.round(b.getBoundingClientRect().height)}`));
    assert.deepEqual(await overflowReport(page, w), [], 'the first screen');
    assert.deepEqual(await small(), [], 'the first screen\'s buttons');
    await sit(page, { seed: 51, size: 10, role: 'town' });
    await begin(page);
    assert.deepEqual(await overflowReport(page, w), [], 'night');
    await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
    await page.click('#mid-go');
    await settle(page);
    const other = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id);
    await page.click(`.seat[data-id="${other}"]`);
    assert.deepEqual(await overflowReport(page, w), [], 'the talk, a seat picked');
    assert.deepEqual(await small(), [], 'the game\'s buttons');
    const seats = await page.evaluate(() => { const t = document.querySelector('#table').getBoundingClientRect(); return [...document.querySelectorAll('.seat')].map(x => { const r = x.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1 && r.width >= 44 && r.height >= 44 && r.top >= t.top - 60; }); });
    assert.ok(seats.length === 10 && seats.every(Boolean), 'ten seats, each on screen and big enough to tap');
    await page.fill('#say', 'Hm.');
    await page.click('#btn-say');
    await settle(page);
    await page.click('#btn-vote');
    assert.deepEqual(await overflowReport(page, w), [], 'the vote');
    // Straight to the end, for the reveal.
    await page.evaluate(() => { Game.App.quiet = false; Game.state.players[0].alive = false; Game.state.players[0].out = { how: 'night', day: 1 }; Game.UI.render(); });
    await page.click('#btn-skip');
    await settle(page);
    await page.waitForSelector('dialog[open] .reveal');
    assert.deepEqual(await overflowReport(page, w), [], 'the reveal');
    const d = await page.evaluate(() => { const r = document.querySelector('dialog[open]').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight + 1; });
    assert.ok(d, 'the reveal fits the screen');
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
