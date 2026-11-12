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
   widths; no innerHTML and one fetch.
   The talk is live (the owner: "how can it feel like 8 humans are talking?
   rather than ai and game"): the table talks on by itself and the player
   speaks whenever they like. Most tests here sit down at a table that
   takes turns (live: false), where each step ends and can be waited for;
   the live table has tests of its own (who is typing, the player speaking
   meanwhile, one at a time, the floor theirs when something is put to
   them, the vote dropping what was being
   typed, a reload in the middle). Run with: node tests/run.cjs lastcall */
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
  await page.evaluate(o => { Game.App.speed = 0; Game.App.quiet = true; Game.App.addOn = 0; Game.App.newGame(Object.assign({ seed: 11, size: 8, mode: 'demo', name: 'Joe', live: false }, o)); }, opts || {});
  await page.click('dialog .btn.primary');
};
const begin = async page => { await page.click('#mid-go'); await settle(page); };
/* Let the table talk a round without the player: Pass beside the empty box (still in), or Watch them talk (out). */
const pass = async page => { if (await page.$('#btn-pass')) await page.click('#btn-pass'); else { await page.fill('#say', ''); await page.click('#btn-say'); } await settle(page); };
const st = page => page.evaluate(() => { const g = Game.state; return { phase: g.phase, day: g.day, said: g.said, winner: g.winner, me: g.players[0], players: g.players.map(p => ({ id: p.id, first: p.first, name: p.name, role: p.role, alive: p.alive, out: p.out })) }; });
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
    if (opts && opts.delay) await new Promise(r => setTimeout(r, opts.delay));
    const out = host ? { say: 'The generator coughs twice and the room goes dark.' }
      : need.includes('vote') ? { vote: other, say: `${other}. I have my reasons.`, note: `voted ${other}` }
        : need.includes('take') && need.includes('say') ? { take: other, say: `Take ${other}. Too sharp by half.` }
          : need.includes('take') ? { take: other, note: `took ${other}` }
            : need.length === 1 ? { say: 'You will all be sorry by morning.' }
              : opts && opts.plain ? { say: 'Too quiet in here, All of you.', more: opts.more ? 'Just saying, that is all I mean here' : null, about: null, stance: 'other', ready: !!opts.ready, suspect: other, trust: null, feel: `sore at ${other}`, note: `watching ${other}` }
              : { say: `${other}, You were too quiet.`, more: opts && opts.more ? 'Just saying, that is all I mean here' : null, about: other, stance: 'accuse', ready: !!(opts && opts.ready), suspect: other, trust: null, feel: `sore at ${other}`, note: `pressing ${other}` };
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
      if (g.me.alive && g.said === 0) { await page.fill('#say', 'Somebody here is lying to me.'); await page.click('#btn-say'); await settle(page); }
      else if (g.said < 5) await pass(page);
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
  assert.ok(shown.host >= 2, 'the host speaks at each morning and each vote');
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
  await page.click('#f-pace [data-v="turns"]');
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
  await pass(page);
  await pass(page);
  await pass(page);
  const said = await page.evaluate(() => Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk').map(e => [e.who, e.text]));
  assert.equal(said[0][0], 'you');
  assert.ok(said.length >= 3 && said.slice(1).every(x => /you were too quiet/i.test(x[1])), 'what Claude sent back is what is said');
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
  assert.match(userOf(town), /^HOW YOU TYPE: [^\n]+ Your manner: [^\n]+\.$/m, 'each seat has its own way of typing and its own manner');
  assert.match(bodies[0].body.system[0].text, new RegExp(`^PLAYING: Joe, (?:\\w+, )*${mate.first}\\b`, 'm'), 'and the others are names, no more');
  assert.match(bodies[0].body.system[0].text, /One person is the Fool, on nobody's side/, 'the wild cards are in the rules every seat is given');
  // The host.
  const hosts = bodies.filter(isHost);
  assert.ok(hosts.length >= 1, 'the host is asked for the morning');
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
  await page.click('#f-pace [data-v="turns"]');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click('#mid-go');
  await settle(page);
  if ((await st(page)).me.alive) { await page.fill('#say', 'Well?'); await page.click('#btn-say'); await settle(page); } else await pass(page);
  await pass(page);
  await pass(page);
  const out = await page.evaluate(() => ({ notices: Game.state.log.filter(e => e.kind === 'notice' && /failed/.test(e.text)).map(e => e.text), talk: Game.state.log.filter(e => e.t === 'say' && e.who !== 'you').length, host: Game.state.log.filter(e => e.kind === 'host').length, failed: Game.state.usage.failed, save: window.localStorage.getItem('novatria.lastcall'), text: document.body.textContent }));
  assert.ok(bodies.length >= 2, 'the calls were made');
  assert.equal(out.notices.length, 1, 'said once');
  assert.match(out.notices[0], /^A call to Claude failed \(the stand-in is down\), so that seat played from its script\. The game goes on\.$/);
  assert.ok(out.talk >= 2 && out.failed >= 2 && out.host >= 1, 'and the table still talks, the host too');
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

s.test('one at a time, and the floor is the player\'s when something is put to them: nobody else speaks until they answer, pass or call the vote (now and then one of the table adds to it first, once); who is waiting is said under the chat and marked on their seat, the quick replies are aimed at them, and the answer goes to them', async h => {
  const page = await open(h);
  await sit(page, { seed: 81, role: 'town', wild: false });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); for (const p of Game.state.players) p.type = 'proper'; });
  await page.click('#mid-go');
  await settle(page);
  // The next to speak puts a question to the player; anyone after that would only say Hm.
  const asksOnce = () => { let n = 0; Game.Bots.say = p => { n += 1; return n === 1 ? { text: `Joe, who do you make it? (${p.first})`, aim: Game.state.players[0], stance: 'question' } : { text: `Hm. (${p.first})`, aim: null, stance: 'other' }; }; };
  const view = () => page.evaluate(() => {
    const f = Game.state.floor;
    const talk = Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk' && e.day === Game.state.day);
    const box = document.querySelector('#typing');
    return { floor: f ? f.who : null, first: f ? Game.state.players.find(p => p.id === f.who).first : null, who: talk.map(e => e.who), texts: talk.map(e => e.text), waiting: box.hidden ? null : box.textContent, attr: box.dataset.waiting,
      seats: [...document.querySelectorAll('.seat[data-asking="1"]')].map(x => x.dataset.id), marked: [...document.querySelectorAll('#log .say[data-toyou="1"]')].length, to: (document.querySelector('#chips .chips-to') || {}).textContent || null,
      chips: [...document.querySelectorAll('#chips .chip')].map(c => c.textContent), placeholder: document.querySelector('#say').placeholder, btn: document.querySelector('#btn-say').textContent, mid: (document.querySelector('#mid-ready') || {}).textContent, tray: !!document.querySelector('#asks') };
  });
  await page.evaluate(asksOnce);
  await pass(page);
  let v = await view();
  assert.equal(v.who.length, 1, 'one of them spoke, and nobody after: ' + v.texts.join(' | '));
  assert.equal(v.floor, v.who[0]);
  assert.match(v.texts[0], /^Joe, who do you make it\?/);
  assert.deepEqual([v.waiting, v.attr, v.mid], [`${v.first} is waiting for you. Take your time.`, '1', 'waiting on you']);
  assert.deepEqual([v.seats, v.marked], [[v.floor], 1], 'a mark on their seat, and the line marked "to you" in the chat');
  assert.deepEqual([v.to, v.placeholder, v.chips], [`To ${v.first}:`, `Answer ${v.first}`, ["It's you.", 'Liar.', 'Why?', "I'm with you.", 'Not me.']], 'the quick replies are aimed at whoever is waiting');
  assert.equal(v.tray, false, 'and there is no list: only one thing is ever put to the player at a time');
  // A quick reply answers it in one tap: it goes to them, and they are the next to speak.
  const asker = v.floor;
  await page.click('#chips .chip[data-chip="Not me."]');
  await settle(page);
  v = await view();
  assert.deepEqual([v.who[1], v.texts[1], v.who[2], v.floor, v.waiting, v.seats], ['you', `Not me, ${await page.evaluate(id => Game.state.players.find(p => p.id === id).first, asker)}.`, asker, null, null, []]);
  assert.ok(v.who.length >= 4, 'and the table talks on: ' + v.who.length);
  // An answer that names nobody still goes to whoever was waiting.
  await page.evaluate(asksOnce);
  await pass(page);
  v = await view();
  const second = v.floor;
  assert.ok(second);
  let n = v.who.length;
  await page.fill('#say', 'no idea yet, give me a minute');
  await page.click('#btn-say');
  await settle(page);
  v = await view();
  assert.deepEqual([v.who[n], v.who[n + 1], v.floor], ['you', second, null]);
  // Passing lets it go by: said so, the seats are told, and the table goes on.
  await page.evaluate(asksOnce);
  await pass(page);
  v = await view();
  assert.ok(v.floor);
  n = v.who.length;
  assert.equal(v.btn, 'Pass');
  await pass(page);
  v = await view();
  assert.equal(v.floor, null);
  assert.ok(v.who.length > n, 'they talk on');
  assert.ok((await sysLines(page)).includes('You say nothing.'));
  assert.match(await page.evaluate(() => Game.recordText()), /^Joe says nothing to that\.$/m);
  // Now and then one of them adds to it, once, and then they wait.
  await page.evaluate(() => { Game.App.addOn = 1; let k = 0; Game.Bots.say = p => { k += 1; return k === 1 ? { text: `Joe, why so sure? (${p.first})`, aim: Game.state.players[0], stance: 'question' } : { text: `Yeah Joe, answer that. (${p.first})`, aim: Game.state.players[0], stance: 'question' }; }; });
  n = v.who.length;
  await pass(page);
  v = await view();
  assert.equal(v.who.length, n + 2, 'the question, one adding to it, and no more');
  assert.notEqual(v.who[n], v.who[n + 1]);
  assert.equal(v.floor, v.who[n], 'the floor is still for the one who asked: what was added is not a second question to answer');
  // The vote clears it.
  await page.click('#btn-vote');
  assert.deepEqual(await page.evaluate(() => [Game.state.floor, document.querySelector('#typing').hidden, document.querySelectorAll('.seat[data-asking="1"]').length]), [null, true, 0]);
});

s.test('at a live table the talk stops for the player when something is put to them: nobody types until they answer or pass, however long they take, and the one who adds to it is told to add and not to ask', async h => {
  const page = await open(h);
  await sit(page, { seed: 81, role: 'town', wild: false, live: true });
  await begin(page);
  await page.evaluate(() => {
    Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop();
    let n = 0;
    Game.Bots.say = p => { n += 1; return n === 3 || n === 6 ? { text: `Joe, who do you make it? (${p.first})`, aim: Game.state.players[0], stance: 'question' } : { text: `Hm. (${p.first})`, aim: null, stance: 'other' }; };
  });
  await page.click('#mid-go');
  await page.waitForFunction(() => !!Game.state.floor);
  const held = () => page.evaluate(() => ({ said: Game.state.said, talking: Game.talking, busy: Game.busy, typing: document.querySelectorAll('.seat[data-typing="1"]').length, waiting: document.querySelector('#typing').dataset.waiting, text: document.querySelector('#typing').textContent,
    btn: document.querySelector('#btn-say').textContent, off: document.querySelector('#btn-say').disabled, mid: document.querySelector('#mid-ready').textContent, last: Game.state.log[Game.state.log.length - 1].who, floor: Game.state.floor.who }));
  const a = await held();
  assert.deepEqual([a.said, a.talking, a.busy, a.typing, a.waiting, a.btn, a.off, a.mid], [3, true, false, 0, '1', 'Pass', false, 'waiting on you']);
  assert.match(a.text, /^\w+ is waiting for you\. Take your time\.$/);
  await page.waitForTimeout(700);
  const b = await held();
  assert.deepEqual([b.said, b.typing, b.last], [3, 0, a.floor], 'nobody has spoken since, and nobody is typing');
  // The player answers, naming nobody: it goes to the one who asked, who speaks next, and the table is off again.
  await page.fill('#say', 'thinking. not sure yet');
  assert.equal(await page.textContent('#btn-say'), 'Send');
  await page.click('#btn-say');
  await page.waitForFunction(() => Game.state.said >= 4);
  const after = await page.evaluate(() => { const l = Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk'); const i = l.map(e => e.who).lastIndexOf('you'); return [l[i].text, l[i + 1].who]; });
  assert.deepEqual(after, ['thinking. not sure yet', a.floor]);
  // Asked again: this time they pass.
  await page.waitForFunction(() => !!Game.state.floor);
  assert.equal(await page.evaluate(() => Game.state.said), 6);
  await page.click('#btn-say');
  assert.deepEqual(await page.evaluate(() => [Game.state.floor, Game.state.log.some(e => e.text === 'You say nothing.')]), [null, true]);
  await page.waitForFunction(() => Game.state.phase === 'vote' && !Game.talking, null, { timeout: 20000 });
  assert.ok(await page.evaluate(() => Game.state.said > 6), 'and they talk on to the vote');
  // With Claude: whoever adds to what was put to the player is told to add to it, and nothing more.
  const bodies = [];
  const claude = await open(h, { route: standIn(bodies) });
  await claude.fill('#f-key', 'sk-ant-test-key');
  await claude.fill('#f-name', 'Joe');
  await claude.click('#f-role [data-v="knife"]');
  await claude.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; Game.App.addOn = 1; });
  await claude.click('#f-pace [data-v="turns"]');
  await claude.click('#btn-new');
  await claude.click('dialog .btn.primary');
  await begin(claude);
  await claude.click(`.seat[data-id="${await claude.evaluate(() => Game.state.players.find(p => p.alive && p.role === 'town').id)}"]`);
  await claude.click('#mid-go');
  await settle(claude);
  for (let i = 0; i < 6 && !(await claude.evaluate(() => !!Game.state.floor)); i++) await pass(claude);
  const userOf = x => x.body.messages[0].content.map(c => c.text).join('\n');
  const talk = bodies.filter(x => x.body.output_config.format.schema.required.includes('stance')).map(userOf);
  const add = talk[talk.length - 1];
  assert.match(add, /\w+ has just put this to Joe, who has not had time to answer yet: "[^"]+" Add to it in a few words: back it up, or say you do not buy it\. Do not ask Joe anything else and do not change the subject\./);
  assert.match(/^LENGTH THIS TURN: (.+)$/m.exec(add)[1], /^(just a reaction|a few words)/);
  assert.match(bodies[0].body.system[0].text, /People need time to read and type\. Never hold it against anyone that they have not answered yet, or that they have said nothing for a few messages\./);
});

s.test('they play like people who are trying to win, and write like people in a group chat: each seat has a temperament and a way of typing of its own, is told how much to send each turn (sometimes only a reaction) and is cut off if it goes on; nobody but the seats speaks', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { plain: true }) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-role [data-v="town"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#f-pace [data-v="turns"]');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click('#mid-go');
  await settle(page);
  await pass(page);
  await pass(page);
  await pass(page);
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const talk = bodies.filter(b => b.body.output_config.format.schema.required.includes('stance'));
  assert.ok(talk.length >= 6);
  const sys = talk[0].body.system[0].text;
  assert.match(sys, /^You are one of 8 friends playing "Last Call", a hidden-role party game like Werewolf or Mafia, in the game's group chat\./);
  assert.match(sys, /Play to win, the way a sharp, ordinary person plays a party game\./);
  assert.match(sys, /You are not a detective giving a summing-up, and you are not a fool or a clown either\./);
  assert.match(sys, /It is a lean, never a script: it never makes you play badly, ignore what was said, or act a part\./);
  assert.match(sys, /You are a person and you carry things: sore at whoever came after you or voted for you/);
  // Written the way people type, not the way a book is written.
  assert.match(sys, /You are typing into a fast group chat with friends, in the middle of a game\. Write the way people really type there, never the way a book or an assistant writes\./);
  assert.match(sys, /Mostly lowercase, light on punctuation, no full stop at the end of a message, no semicolons, no dashes, no quotation marks\./);
  assert.match(sys, /Do not keep using people's names\./);
  assert.match(sys, /Nothing that sounds written\./);
  assert.match(sys, /Not every message is a move\./);
  assert.doesNotMatch(sys, /Reason from the votes|one to three short sentences|Hold a view and say why/, 'the instructions that made them all careful and long are gone');
  assert.doesNotMatch(sys, /impulsive|often wrong|lean into it even when it is not the clever move|Never weigh the evidence|Lie plainly/, 'and so are the ones that made them play the fool');
  assert.doesNotMatch(sys, /Voice:|Manner:|\(\d\d\)/, 'nobody is a character sheet to the others: a name, no more');
  const tempers = await page.evaluate(() => Game.STYLES.map(x => x.text).join(' '));
  assert.doesNotMatch(tempers, /often wrong|get details wrong|do not care|without a reason|whatever happens|probably right/, 'no temperament is a way of playing badly');
  // Each turn: a temperament, a way of typing, and how much to send.
  const ways = new Set();
  const hands = new Set();
  const lengths = new Set();
  for (const b of talk) {
    const u = userOf(b);
    const way = /^YOUR TEMPERAMENT: (.+)$/m.exec(u);
    const hand = /^HOW YOU TYPE: (.+?) Your manner: (.+)$/m.exec(u);
    const len = /^LENGTH THIS TURN: (.+)$/m.exec(u);
    assert.ok(way && hand && len, 'every turn is given all three');
    assert.doesNotMatch(hand[2], /['"‘’“”]\w[^'"]*['"‘’“”]|\bsugar\b|\bhon\b|ma'am|\bheh\b|\bcuz\b|\bbro\b/i, 'a manner, never a catchphrase: ' + hand[2]);
    ways.add(way[1]);
    hands.add(hand[1]);
    lengths.add(len[1]);
    assert.doesNotMatch(u, /round \d of \d/, 'and there are no rounds');
  }
  assert.ok(ways.size >= 2, 'they do not all play the same way');
  assert.ok(hands.size >= 2, 'or type the same way');
  assert.ok([...lengths].every(l => /^(just a reaction: six words at most\. Not a move and not an argument: a groan, a laugh, a dig, "ugh", "ok that was weird", "can we just vote"\.|a few words: ten at most\. A fragment is fine\.|one sentence: twenty words at most\.|two short sentences: thirty-four words at most\.)$/.test(l)), [...lengths].join(' | '));
  const hunch = talk.filter(b => /^A HUNCH: you have a slight feeling about \w+, nothing solid\. It is somewhere to start; drop it the moment the table gives you something better\.$/m.test(userOf(b)));
  assert.ok(hunch.length < talk.length, 'a hunch is for a few of them, not the way the whole table thinks');
  const dealt = await page.evaluate(() => ({ styles: Game.state.players.filter(p => !p.you).map(p => p.style), known: Game.STYLES.map(x => x.id), types: Game.state.players.filter(p => !p.you).map(p => p.type), hands: Game.TYPES.map(x => x.id), chat: Game.state.players.filter(p => !p.you).map(p => p.chat) }));
  assert.ok(dealt.styles.every(x => dealt.known.includes(x)));
  assert.equal(dealt.styles.filter(x => x === 'tracker').length, 1, 'one of them keeps track of the votes, and only one');
  assert.ok(dealt.types.every(x => dealt.hands.includes(x)) && new Set(dealt.types).size === 7, 'no two of the seven type alike: ' + dealt.types.join(','));
  assert.ok(Math.max(...dealt.chat) >= 2 * Math.min(...dealt.chat), 'some talk a lot and some lurk: ' + dealt.chat.join(','));
  // What comes back is put in that seat's hand: lower case for most, the last full stop dropped, no dashes.
  const hand = await page.evaluate(() => [
    Game.typed({ type: 'lower' }, 'It is You, Leon. I am Sure.'),
    Game.typed({ type: 'proper' }, 'It is you, Leon. I am sure.'),
    Game.typed({ type: 'loose' }, 'Nah — not buying it; sorry.'),
    Game.typed({ type: 'caps' }, 'that is NOT what you said??'),
    Game.typed({ type: 'dots' }, 'I dunno...')
  ]);
  assert.deepEqual(hand, ['it is you, leon. i am sure', 'It is you, Leon. I am sure.', 'nah, not buying it, sorry', 'that is NOT what you said??', 'i dunno...']);
  const lower = await page.evaluate(() => { const ids = Game.TYPES.filter(x => x.lower === true).map(x => x.id); return Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk' && e.who !== 'you' && ids.includes(Game.state.players.find(p => p.id === e.who).type)).map(e => e.text); });
  assert.ok(lower.length >= 1 && lower.every(x => x === x.toLowerCase() && !/[^.]\.$/.test(x)), lower.join(' | '));
  // Cut off: whole sentences up to the limit, else at a clause.
  const cut = await page.evaluate(() => [
    Game.clip('Nah.', 8),
    Game.clip('It is you, Leon. I have watched you all night and you never once looked up, which is what a guilty man does when he thinks nobody is counting.', 8),
    Game.clip('I have watched you all night and you never once looked up from that glass, which is what a guilty man does when he thinks nobody at the table is counting', 8),
    Game.clip('One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve. Thirteen. Fourteen. Fifteen.', 8)
  ]);
  assert.equal(cut[0], 'Nah.');
  assert.equal(cut[1], 'It is you, Leon.');
  assert.ok(cut[2].endsWith('…') && cut[2].split(' ').length <= 13, cut[2]);
  assert.equal(cut[3].split(' ').length, 12);
  const said = await page.evaluate(() => Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk' && e.who !== 'you').map(e => e.text.split(/\s+/).length));
  assert.ok(said.every(n => n <= 42), 'nothing said is a paragraph: ' + said.join(','));
  // Nobody but the seats speaks: there is no chorus, and the host has one line, at the morning.
  assert.ok(bodies.every(b => !b.body.output_config.format.schema.required.includes('reactions')), 'no call for the room\'s reactions');
  const kinds = await page.evaluate(() => Game.state.log.filter(e => e.t === 'sys').map(e => e.kind));
  assert.ok(!kinds.includes('react'));
  assert.equal(kinds.filter(k => k === 'host').length, 1, 'the host has the morning, and not the night');
});

s.test('what the player says is answered: the first seat to speak is given their words and told to answer them, the second to take them up, and a round the player passes has none of it; in the offline demo the scripted seats answer too', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { plain: true }) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  // (A Knife, so the night is the player's to decide and they are at the table in the morning.)
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#f-pace [data-v="turns"]');
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
  // Said to everyone: one of them answers, then another takes it up, having read the first.
  assert.ok(round[0].includes(`Joe has just said, to everyone: "${words}" Answer Joe: take up what they said (agree, argue with it, or answer the question), speaking to them.`), round[0].slice(-400));
  assert.ok(round[1].includes(`Joe said a moment ago: "${words}" Take that up as well, or what has been said about it since. Do not start a new subject.`), round[1].slice(-400));
  assert.notEqual(/^YOUR SEAT: (.+)\.$/m.exec(round[0])[1], /^YOUR SEAT: (.+)\.$/m.exec(round[1])[1], 'two different people');
  assert.equal(round[0].includes('Joe: "' + words + '"'), true, 'and it is in the record they are given');
  assert.match(round[1], /: "too quiet in here, all of you\.?"\s/i, 'the second has read what the first said: one at a time');
  if (round[2]) assert.doesNotMatch(round[2], /Joe has just said|Joe said a moment ago/, 'the third is free to move on');
  // An answer has room to be one: never a bare reaction.
  for (const u of round.slice(0, 2)) assert.doesNotMatch(/^LENGTH THIS TURN: (.+)$/m.exec(u)[1], /^just a reaction/);
  // A line to one of them: that one speaks first, and is told it was said to them.
  const to = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).first);
  from = talkOf().length;
  await page.fill('#say', `${to}, why so quiet?`);
  await page.click('#btn-say');
  await settle(page);
  round = talkOf().slice(from).map(userOf);
  assert.match(round[0], new RegExp(`^YOUR SEAT: ${to} `, 'm'));
  assert.ok(round[0].includes(`Joe has just said, to you: "${to}, why so quiet?" Answer Joe:`), round[0].slice(-400));
  assert.ok(round[1].includes(`Joe said a moment ago: "${to}, why so quiet?" Take that up as well, or what has been said about it since. Do not start a new subject.`), 'and one more takes it up: ' + round[1].slice(-300));
  assert.doesNotMatch(round[1], new RegExp(`^YOUR SEAT: ${to} `, 'm'));
  // The scripted seats (the offline demo, a failed call) take it up too.
  const demo = await open(h);
  await sit(demo, { seed: 91, role: 'town', wild: false });
  await begin(demo);
  await demo.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
  await demo.click('#mid-go');
  await settle(demo);
  await demo.fill('#say', 'I have no idea who it is.');
  await demo.click('#btn-say');
  await settle(demo);
  const after = await demo.evaluate(() => { const l = Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk'); const i = l.map(e => e.who).lastIndexOf('you'); return l.slice(i + 1, i + 3).map(e => e.text); });
  assert.ok(after.length >= 1, 'one answers (and the table waits there, if it was a question back)');
  for (const x of after) assert.match(x, /\bJoe\b|\byou\b/i, 'said to the player: ' + x);
});

s.test('a live table talks on by itself until the vote, and the player speaks whenever they like: one at a time, nobody twice running, some say a lot and some little, the morning opens on the night, and there are no rounds; what someone said can be tapped to aim at them', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, role: 'town', wild: false, live: true });
  await begin(page);
  await page.evaluate(() => { Game.App.speed = 0.02; Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop();
    // (Nothing is put to the player here: what happens when it is has a test of its own.)
    const line = Game.Bots.say; Game.Bots.say = (p, x) => { const r = line(p, x); if (r.aim && r.aim.you) { r.aim = null; r.stance = 'other'; } r.text = r.text.replace(/\bjoe\b/ig, 'someone').replace(/\?/g, '.'); return r; }; });
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.talking && Game.state.said >= 2);
  // In the middle of it: nothing is locked, there is nothing to pass, and the middle of the table has the day and no round.
  const mid = await page.evaluate(() => ({ busy: Game.busy, btn: document.querySelector('#btn-say').textContent, off: document.querySelector('#btn-say').disabled, pass: !!document.querySelector('#btn-pass'), box: document.querySelector('#say').disabled,
    mid: document.querySelector('#mid').textContent, vote: !!document.querySelector('#btn-vote'), chips: [...document.querySelectorAll('#chips .chip')].map(c => c.textContent), to: !!document.querySelector('#chips .chips-to') }));
  assert.deepEqual([mid.busy, mid.btn, mid.off, mid.pass, mid.box, mid.vote], [false, 'Send', true, false, false, true]);
  assert.match(mid.mid, /^Day 1\d still in/);
  assert.doesNotMatch(mid.mid, /round/i);
  assert.deepEqual([mid.chips, mid.to], [['Who is it, then?', 'No idea.'], false], 'nobody is aimed at unless the player chose them: the last to speak changes under the finger');
  assert.deepEqual(await overflowReport(page, 375), []);
  // The player speaks: it is in the story at once, and the table goes on.
  await page.fill('#say', 'I have no idea who it is.');
  assert.equal(await page.evaluate(() => document.querySelector('#btn-say').disabled), false);
  await page.click('#btn-say');
  assert.deepEqual(await page.evaluate(() => [Game.state.log.some(e => e.who === 'you' && e.text === 'I have no idea who it is.'), document.querySelector('#say').value, Game.busy]), [true, '', false]);
  // What someone said can be tapped: it picks them, as their face does.
  const picked = await page.evaluate(() => { const n = [...document.querySelectorAll('#log .say[data-pick="1"]')].pop(); n.click(); return { who: n.dataset.who, sel: Game.UI.sel, to: (document.querySelector('#chips .chips-to') || {}).textContent, first: Game.state.players.find(p => p.id === n.dataset.who).first }; });
  assert.deepEqual([picked.sel, picked.to], [picked.who, `To ${picked.first}:`]);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.waitForFunction(() => Game.state.phase === 'vote' && !Game.talking && !Game.busy, null, { timeout: 20000 });
  const day = await page.evaluate(() => {
    const l = Game.state.log.filter(e => e.day === 1);
    const talk = l.filter(e => e.t === 'say' && e.kind === 'talk');
    const by = {};
    for (const p of Game.state.players) if (p.alive && !p.you) by[p.id] = 0;
    for (const e of talk) if (e.who !== 'you') by[e.who] += 1;
    return { who: talk.map(e => e.who), texts: talk.map(e => e.text), by: Object.values(by), sys: l.filter(e => e.t === 'sys').map(e => e.text), victim: Game.state.players.find(p => !p.alive).first.toLowerCase(), said: Game.state.said };
  });
  assert.ok(day.said >= 8, 'they talked, though the player passed nothing: ' + day.said);
  assert.equal(day.who.filter(w => w === 'you').length, 1);
  for (let i = 1; i < day.who.length; i++) assert.ok(day.who[i] !== day.who[i - 1], 'nobody speaks twice running: ' + day.who.join(' '));
  assert.ok(Math.max(...day.by) >= Math.min(...day.by) + 2, 'some say a lot and some little: ' + day.by.join(','));
  assert.notEqual(day.who[0], day.who[1]);
  for (const x of day.texts.slice(0, 2)) assert.match(x.toLowerCase(), new RegExp(`^(not ${day.victim}|oh no|damn|${day.victim}[?.]{2} really|well that is bad|great\\. just great)$`), 'the morning opens on the night: ' + x);
  assert.match(day.sys[day.sys.length - 1], /^(That is enough talk\. The table votes\.|Most of the table wants to vote\. The table votes\.)$/);
  assert.equal(await page.evaluate(() => document.querySelector('#typing').hidden), true);
});

s.test('at a live table with Claude: whoever is up is shown typing, one at a time; the player\'s words go in while they type and are answered by one and then another, a second message sits under the first with no name, the player\'s are on the right, and what was being typed when the vote is called is dropped', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { delay: 150, more: true, plain: true }) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  // (A Knife, so the night is the player's to decide and they are at the table in the morning.)
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  assert.equal(await page.evaluate(() => document.querySelector('#f-pace [aria-pressed="true"]').dataset.v), 'live', 'a live table is what is offered first');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.state.players.find(p => p.alive && p.role === 'town').id)}"]`);
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.talking && !document.querySelector('#typing').hidden);
  await page.evaluate(() => { Game.state.clock = 60; window.most = 0; const seen = () => { window.most = Math.max(window.most, document.querySelectorAll('#typing .say-face').length, document.querySelectorAll('.seat[data-typing="1"]').length); }; new MutationObserver(seen).observe(document.querySelector('#typing'), { childList: true }); seen(); });
  const typing = await page.evaluate(() => ({ faces: document.querySelectorAll('#typing .say-face').length, seats: document.querySelectorAll('.seat[data-typing="1"]').length, dots: document.querySelectorAll('#typing .typing-dots i').length, busy: Game.busy, live: Game.state.live }));
  assert.deepEqual([typing.faces, typing.seats, typing.dots, typing.busy, typing.live], [1, 1, 3, false, true], JSON.stringify(typing));
  // The player speaks while they type.
  const words = "it's a pain in the ass we lost the witness day 1 ffs";
  await page.fill('#say', words);
  await page.click('#btn-say');
  assert.ok(await page.evaluate(w => Game.state.log.some(e => e.who === 'you' && e.text === w), words), 'in at once');
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const talkOf = () => bodies.filter(b => b.body.output_config.format.schema.required.includes('stance')).map(userOf);
  const first = () => talkOf().findIndex(u => u.includes(`Joe has just said, to everyone: "${words}" Answer Joe:`));
  for (let i = 0; i < 60 && (first() < 0 || talkOf().length < first() + 2); i++) await page.waitForTimeout(50);
  assert.ok(first() >= 0, 'one of them answers');
  assert.ok(talkOf()[first() + 1].includes(`Joe said a moment ago: "${words}" Take that up as well`), 'then another takes it up');
  // A second message from the same person sits under the first, with no name and no face.
  await page.waitForFunction(() => !!document.querySelector('#log .say[data-run="1"]'), null, { timeout: 10000 });
  const look = await page.evaluate(() => {
    const log = document.querySelector('#log').getBoundingClientRect();
    const run = document.querySelector('#log .say[data-run="1"]');
    const first = run.previousElementSibling;
    const mine = document.querySelector('#log .say[data-you="1"][data-kind="talk"] .say-text').getBoundingClientRect();
    const theirs = first.querySelector('.say-text').getBoundingClientRect();
    return { same: run.dataset.who === first.dataset.who, head: getComputedStyle(run.querySelector('.say-head')).display, firstHead: getComputedStyle(first.querySelector('.say-head')).display, name: first.querySelector('.say-who').textContent,
      words: run.querySelector('.say-words').textContent, mineRight: Math.round(log.right - mine.right), theirsLeft: Math.round(theirs.left - log.left), mineLeft: Math.round(mine.left - log.left), myHead: getComputedStyle(document.querySelector('#log .say[data-you="1"][data-kind="talk"] .say-head')).display };
  });
  assert.deepEqual([look.same, look.head, look.firstHead, look.myHead], [true, 'none', 'block', 'none']);
  assert.match(look.words, /^just saying, that is all i mean here$/i);
  assert.ok(look.mineRight <= 2 && look.theirsLeft <= 40 && look.mineLeft > look.theirsLeft, 'theirs on the left, the player\'s on the right: ' + JSON.stringify(look));
  assert.deepEqual(await overflowReport(page, 375), []);
  assert.equal(await page.evaluate(() => window.most), 1, 'never two typing at once');
  // The vote, called while someone is typing: what they were typing is dropped.
  await page.waitForFunction(() => Game.talking && !document.querySelector('#typing').hidden);
  const before = await page.evaluate(() => Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk').length);
  await page.click('#btn-vote');
  assert.deepEqual(await page.evaluate(() => [Game.state.phase, Game.talking, document.querySelector('#typing').hidden]), ['vote', false, true]);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk').length), before);
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].text), 'You call the vote.');
});

s.test('they carry things from one day to the next: who voted for them, whether their own vote was right, who came after them, and how they said they feel', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#f-pace [data-v="turns"]');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.state.players.find(p => p.alive && p.role === 'town').id)}"]`);
  await page.click('#mid-go');
  await settle(page);
  await pass(page);
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const talkOf = () => bodies.filter(b => b.body.output_config.format.schema.required.includes('stance')).map(userOf);
  // The player goes after one of them, who answers with that on their mind.
  const sore = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you && p.role !== 'knife').first);
  let from1 = talkOf().length;
  await page.fill('#say', `It's you, ${sore}.`);
  await page.click('#btn-say');
  await settle(page);
  const day1 = talkOf();
  assert.match(day1[from1], new RegExp(`^YOUR SEAT: ${sore} `, 'm'));
  assert.match(day1[from1], /^WHAT YOU ARE CARRYING: Joe came after you today\.$/m, 'pointed at, and they know by whom');
  for (let i = 0; i < 10 && !talkOf().some(u => /^HOW YOU FEEL: sore at \w+$/m.test(u)); i++) await pass(page);
  assert.ok(talkOf().some(u => /^HOW YOU FEEL: sore at \w+$/m.test(u)), 'what a seat said it feels is given back to it');
  assert.ok(talkOf().every(u => !/Yesterday/.test(u)));
  // The stand-in has every seat vote for the first name still in that is not its own: the table goes for the player, a Knife.
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id)}"]`);
  await page.click('#mid-go');
  await settle(page);
  assert.equal((await st(page)).me.alive, false);
  await page.click('#mid-go');
  await settle(page);
  const from = talkOf().length;
  await pass(page);
  const day2 = talkOf().slice(from);
  assert.ok(day2.length >= 2);
  const town = day2.find(u => /YOUR SECRET ROLE: (Town|Witness|Watch|Fool|Hothead)/.test(u));
  assert.match(town, /^WHAT YOU ARE CARRYING: .*Yesterday you voted for Joe, who was a Knife\. You called it\./m);
  const mate = day2.find(u => /YOUR SECRET ROLE: Knife/.test(u));
  if (mate) assert.doesNotMatch(mate, /You called it|You got that one wrong/, 'a Knife is not told how to feel about a vote it knew the truth of');
});

s.test('the talk ends when most of the table says it would vote, and two who go at each other are cut in on', async h => {
  const page = await open(h);
  const townLast = () => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); for (const p of Game.state.players) p.type = 'proper'; };
  await sit(page, { seed: 41, role: 'town', wild: false });
  await begin(page);
  await page.evaluate(townLast);
  await page.click('#mid-go');
  await settle(page);
  await page.evaluate(() => { Game.Bots.say = p => ({ text: `Can we just vote. (${p.first})`, aim: null, stance: 'other', ready: true }); });
  await pass(page);
  assert.match(await page.textContent('#mid-ready'), /^7 still in · [23] want to vote$/);
  for (let i = 0; i < 6 && (await st(page)).phase === 'talk'; i++) await pass(page);
  const end = await page.evaluate(() => ({ phase: Game.state.phase, last: Game.state.log[Game.state.log.length - 1].text, clock: Game.state.clock, said: Game.state.said, ready: Game.state.ready.length }));
  assert.deepEqual([end.phase, end.last], ['vote', 'Most of the table wants to vote. The table votes.']);
  assert.ok(end.clock > 0 && end.said >= 6 && end.ready >= 4, 'before it got late, once more than half had said so: ' + JSON.stringify(end));
  // Two who go at each other.
  await sit(page, { seed: 42, role: 'town', wild: false });
  await begin(page);
  await page.evaluate(townLast);
  await page.click('#mid-go');
  await settle(page);
  const pair = await page.evaluate(() => {
    const live = Game.state.players.filter(p => p.alive && !p.you);
    const a = live[0]; const b = live[1];
    Game.Bots.say = p => (p === a ? { text: `It's ${b.first}.`, aim: b, stance: 'accuse' } : p === b ? { text: `It's ${a.first}.`, aim: a, stance: 'accuse' } : { text: `Hm. (${p.first})`, aim: null, stance: 'other' });
    Game.state.pending = [a.id];
    return [a.id, b.id];
  });
  for (let i = 0; i < 5 && (await st(page)).phase === 'talk'; i++) await pass(page);
  const who = await page.evaluate(() => Game.state.log.filter(e => e.t === 'say' && e.kind === 'talk' && e.day === 1).map(e => e.who));
  let run = 0; let longest = 0;
  for (const w of who) { run = pair.includes(w) ? run + 1 : 0; longest = Math.max(longest, run); }
  assert.ok(longest >= 2 && longest <= 3, 'they go at it, and after three somebody else cuts in: ' + who.map(w => (pair.includes(w) ? w.slice(4, 7).toUpperCase() : '.')).join(' '));
});

s.test('a live table left in the middle of the talk picks it up again, and a table kept from before the talk was live is given what a live table has', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, role: 'town', wild: false, live: true });
  await begin(page);
  await page.evaluate(() => { Game.App.speed = 0.02; Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.talking && Game.state.said >= 2);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  const said = await page.evaluate(() => { const s = JSON.parse(window.localStorage.getItem('novatria.lastcall')); const n = s.said; for (const k of ['live', 'clock', 'said', 'bonus', 'ready', 'yours', 'spat']) delete s[k]; for (const p of s.players) { delete p.chat; delete p.type; } window.localStorage.setItem('novatria.lastcall', JSON.stringify(s)); Game.App.speed = 0; return n; });
  assert.ok(said >= 2);
  await page.evaluate(() => { window.setInterval(() => { if (Game.state && Game.state.floor) Game.App.pass(); }, 20); });
  await page.click('#btn-continue');
  const kept = await page.evaluate(() => ({ live: Game.state.live, clock: Game.state.clock, ready: Game.state.ready, hands: Game.state.players.filter(p => !p.you).every(p => p.chat > 0 && Game.TYPES.some(x => x.id === p.type)), talking: Game.talking, phase: Game.state.phase }));
  assert.deepEqual([kept.live, Array.isArray(kept.ready), kept.hands, typeof kept.clock, ['talk', 'vote'].includes(kept.phase)], [true, true, true, 'number', true]);
  await page.waitForFunction(() => Game.state.phase === 'vote' && !Game.talking, null, { timeout: 20000 });
  assert.ok(await page.evaluate(() => Game.state.said >= 1), 'and they talk on');
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
  await page.click('#f-pace [data-v="turns"]');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click('#mid-go');
  await settle(page);
  const seat = bodies.find(b => !/^You are the host/.test(b.body.system[0].text));
  const sys = seat.body.system[0].text;
  assert.match(sys, /\(Joe is one of the people at the table, the same as anyone: there is nothing more to know about them than how they play\.\)$/m);
  assert.match(sys, /Nobody can see anybody, either: no faces, no looks, no sweating, no body language\./);
  assert.doesNotMatch(sys, /\bstranger\b|came in off|nobody here knows/i, 'nothing that makes the player someone to question about themselves');
  assert.match(sys, /The table is all there is\. The only evidence in this game is what happens at it/);
  assert.match(sys, /Where anyone was, where they were going, what they do for a living, who they are to each other and how they came to be here tell you nothing: never ask about them, never bring them up, and never make up something seen, heard or found\./);
  // No town: to the others a seat is a name. No job, no ties, no place.
  assert.match(sys, /Talk about the game and nothing else: this table, tonight, who is lying\. Nothing about a town \("Town" is only the name of a side in this game\), anybody's work, family, money or past, the weather, or any life outside this room/);
  const cast = await page.evaluate(() => Game.state.players.filter(p => !p.you).map(p => { const c = Game.CAST.find(x => x.id === p.id); return { name: p.name, role: c.role, voice: c.voice }; }));
  for (const c of cast) {
    assert.match(sys, new RegExp(`^PLAYING: [^\\n]*\\b${c.name.split(' ')[0]}\\b`, 'm'));
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
