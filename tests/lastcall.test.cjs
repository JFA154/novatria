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
   reveal at the end; the Witness, the Watch turning the Traitors away and a
   tied vote; last words (a seat's and the player's), the Fool winning by
   the vote, the Hothead taking someone along (a seat's choice and the
   player's); the Claude path against a stand-in API (the request's shape,
   what each seat is and is not told, the host told only what is public,
   the cost line, a failed call falling back to the script); the player
   out (every role shown, Skip to the end with no calls); a reload; phone
   widths; the table folded to a strip of faces while a phone's table
   talks (the owner: "taking too much of the screen on mobile so i can
   barely see the text"); no innerHTML and one fetch.
   The house deal (the owner: "1 or 2 games and it gets boring") has its
   own tests at the end: a different deck every night, the Drunk, the
   Bouncer, the Turncoat, the Listener and the Old Friends, each house
   rule, the side bets, the tab the house keeps, the regulars who remember
   the last time, Deal again, and a house table with Claude.
   The talk is live (the owner: "how can it feel like 8 humans are talking?
   rather than ai and game"): the table talks on by itself and the player
   speaks whenever they like. Most tests here sit down at a table that
   takes turns (live: false), where each step ends and can be waited for;
   the live table has tests of its own (who is typing, the player speaking
   meanwhile, two answering at once, the vote dropping what was being
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
    // One of two answers (the mission, an offer in the night, the end game): the first, or the one asked for (opts.pick: a function of the question's caption, giving 0 or 1).
    else if (w === 'pick') { const k = await page.textContent('#mid .mid-k'); await page.click(`#pick-${opts && opts.pick ? opts.pick(k) : 0}`); }
    else {
      const id = (opts && opts.seat) || await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id);
      await page.click(`.seat[data-id="${id}"]`);
      await page.click('#mid-go');
    }
  }
  throw new Error('the step never settled');
};
const sit = async (page, opts) => {
  await page.evaluate(o => { Game.App.speed = 0; Game.App.quiet = true; Game.App.newGame(Object.assign({ seed: 11, size: 8, mode: 'demo', name: 'Joe', live: false }, o)); }, opts || {});
  await page.click('dialog .btn.primary');
};
const begin = async page => { await page.click('#mid-go'); await settle(page); };
/* Let the table talk a round without the player: Pass beside the empty box (still in), or Watch them talk (out). */
const pass = async page => { if (await page.$('#btn-pass')) await page.click('#btn-pass'); else { await page.fill('#say', ''); await page.click('#btn-say'); } await settle(page); };
const st = page => page.evaluate(() => { const g = Game.state; return { phase: g.phase, day: g.day, said: g.said, winner: g.winner, me: g.players[0], players: g.players.map(p => ({ id: p.id, first: p.first, name: p.name, role: p.role, alive: p.alive, out: p.out })) }; });
const sysLines = (page, kind) => page.evaluate(k => Game.state.log.filter(e => e.t === 'sys' && (!k || e.kind === k)).map(e => e.text), kind || null);
/* A stand-in for the API: answers each call with JSON of the shape asked for, naming someone still in who is not the seat itself (nor its fellow Traitor). */
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
    const other = still.find(n => n !== me && !new RegExp(`fellow Traitors?: [^.]*${n}`).test(user));
    if (opts && opts.delay) await new Promise(r => setTimeout(r, opts.delay));
    const out = host ? { say: 'The generator coughs twice and the room goes dark.' }
      : need.includes('vote') ? { vote: other, say: `${other}. I have my reasons.`, note: `voted ${other}` }
        : need.includes('take') && need.includes('say') ? { take: other, say: `Take ${other}. Too sharp by half.` }
          : need.includes('take') ? { take: other, note: `took ${other}` }
            : need.includes('end') ? { end: !!(opts && opts.end), say: 'Not yet, I am not sure.' }
            : need.length === 1 ? { say: 'You will all be sorry by morning.' }
              : { say: `${other}, You were too quiet.`, more: opts && opts.more ? 'Just saying, that is all I mean here' : null, about: other, stance: 'accuse', ready: !!(opts && opts.ready), suspect: other, trust: null, feel: `sore at ${other}`, note: `pressing ${other}` };
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) });
  };
}

s.test('the page stands alone: it opens from file:// with the network shut, the cast is the town\'s adults, every face draws, and the first screen offers a table', async h => {
  const page = await open(h);
  const home = await page.evaluate(() => {
    for (const c of Game.CAST) Game.faceNode(c);
    return { title: document.title, active: document.querySelector('.screen.active').id, cast: Game.CAST.length, young: Game.CAST.filter(c => !(c.age >= 21)).length, firsts: new Set(Game.CAST.map(c => c.name.split(' ')[0])).size,
      mode: document.querySelector('#f-mode [aria-pressed="true"]').dataset.v, wild: document.querySelector('#f-deck [aria-pressed="true"]').dataset.v, tab: document.querySelector('#home-tab').hidden, keyShown: !document.querySelector('#claude-fields').hidden, cont: document.querySelector('#home-continue-row').hidden,
      links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')) };
  });
  assert.deepEqual([home.title, home.active, home.mode, home.wild, home.keyShown, home.cont, home.tab], ['Last Call', 'screen-home', 'claude', 'faithful', true, true, true], 'the Traitors\' table unless told otherwise, and there is no tab before a night has been played');
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
  assert.deepEqual(await page.evaluate(() => [Game.state.mode, Game.state.wild, Game.state.deck, Game.state.players.length]), ['demo', false, 'faithful', 8]);
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
  assert.deepEqual(out.win, ['town', 'knives', null, 'knives'], 'the Fool and the Hothead count with everyone else against the Traitors');
});

s.test('a whole scripted game through the buttons: the role card, the host at each turn of it, each vote one per seat still in, an ending the rules agree with, and the reveal', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, role: 'town' });
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Faithful');
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
  assert.match(shown.mid, /^(The Faithful win|The Traitors win|The Fool wins)$/);
  assert.ok(shown.tags.every(t => ['Faithful', 'Traitor', 'Witness', 'Watch', 'Fool', 'Hothead'].includes(t)), 'every role is on the table at the end: ' + shown.tags.join(','));
  assert.match(shown.last, /^(The Faithful win\. Every Traitor is out: |The Traitors win: |The Fool wins\. )/);
  assert.ok(shown.host >= 2, 'the host speaks at each morning and each vote');
  assert.ok(shown.hostText.every(t => !shown.record.includes(t)), 'and what the host says is colour: it is never in the record a seat is given');
  // The reveal: every role, how each went and how each voted.
  await page.click('#mid-reveal');
  const rows = await page.evaluate(() => [...document.querySelectorAll('dialog .reveal-row')].map(r => ({ role: r.dataset.role, name: r.querySelector('.reveal-name').textContent, fate: r.querySelector('.reveal-fate').textContent })));
  assert.equal(rows.length, 8);
  assert.equal(rows[0].role, 'knife', 'the Traitors first');
  assert.ok(rows.every(r => /^(In at the end|Banished, day \d|Murdered in the night, day \d|Taken by the Hothead, day \d)/.test(r.fate)), JSON.stringify(rows.map(r => r.fate)));
  assert.ok(rows.some(r => / · voted \w+/.test(r.fate)), 'who each voted for');
});

s.test('the Witness learns what is true, the Watch turns the Traitors away, and a tied vote banishes nobody', async h => {
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
  assert.ok((await sysLines(page)).includes(`You watched ${knife.name} in the night. ${knife.first} is a Traitor.`));
  assert.equal(await page.evaluate(id => document.querySelector(`.seat[data-id="${id}"] .seat-tag`).textContent, knife.id), 'Traitor', 'and it stays on their seat');
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
  assert.match(await page.evaluate(() => Game.recordText()), /^Breakfast\. Someone came for one of you in the night and was turned away\. Everyone is still here\.$/m);
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
  assert.ok(after.some(l => /A tie between .* \(4 each\), so nobody is banished\.$/.test(l)), after.slice(-3).join(' | '));
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
  // Everyone votes one Faithful seat out.
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
  assert.match(log[ban][2], new RegExp(`${mark.name} is banished with \\d votes\\. ${mark.first} was a Faithful\\.$`));
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
  // The Fool, banished.
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
  // A seat that is the Hothead, banished, takes whoever it chooses.
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
  assert.deepEqual(g.players.find(p => p.id === hot.knife).out, { how: 'shot', day: 1, by: hot.id });
  assert.ok((await sysLines(page, 'death')).some(l => l.startsWith(`${hot.first} takes ${hot.knifeName} along. `) && l.endsWith('was a Traitor.')));
  assert.match(await page.evaluate(() => Game.recordText()), new RegExp(`^${hot.name} was the Hothead and takes ${hot.knifeName} out too\\.`, 'm'));
  // The player, the Hothead, murdered in the night, picks at the table.
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
  await page.click('#f-deck [data-v="classic"]');
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#f-pace [data-v="turns"]');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  const mate = await page.evaluate(() => Game.state.players.find(p => p.role === 'knife' && !p.you));
  assert.equal(bodies.length, 1, 'the night opens with the fellow Traitor\'s whisper');
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
  const town = talk.find(b => /YOUR SECRET ROLE: (Faithful|Witness|Watch|Fool|Hothead)/.test(userOf(b)));
  const knife = talk.find(b => /YOUR SECRET ROLE: Traitor/.test(userOf(b)));
  assert.ok(town, 'someone who is not a Traitor spoke');
  assert.doesNotMatch(userOf(town), /fellow Traitor|The Traitors murdered|whisper|Too sharp by half/i, 'a seat that is not a Traitor is told nothing of the Traitors');
  assert.doesNotMatch(town.body.system[0].text, /YOUR SECRET ROLE|Your fellow Traitor|The Traitors murdered/, 'and the shared rules name nobody\'s role');
  assert.match(userOf(town), /^Joe: "I was at the bar all night\. Who saw anything\?"$/m, 'the player is in the record by name, as anyone is');
  assert.doesNotMatch(userOf(town), /The generator coughs twice/, 'the host\'s colour is not in a seat\'s record');
  if (knife) assert.match(userOf(knife), /YOUR SECRET ROLE: Traitor\. Your fellow Traitor: Joe\./);
  assert.match(userOf(town), /^HOW YOU TYPE: [^\n]+ Your manner: [^\n]+\.$/m, 'each seat has its own way of typing and its own manner');
  assert.match(bodies[0].body.system[0].text, new RegExp(`^PLAYING: Joe, (?:\\w+, )*${mate.first}\\b`, 'm'), 'and the others are names, no more');
  assert.match(bodies[0].body.system[0].text, /One person is the Fool, on nobody's side/, 'the wild cards are in the rules every seat is given');
  // The host.
  const hosts = bodies.filter(isHost);
  assert.ok(hosts.length >= 1, 'the host is asked for the morning');
  for (const b of hosts) assert.doesNotMatch(userOf(b) + b.body.system[0].text, /SECRET ROLE|fellow Traitor|is a Traitor\b/, 'and is told nothing that is not public');
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
  await page.click('#f-deck [data-v="classic"]');
  await page.click('#f-role [data-v="town"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  await page.click('#f-pace [data-v="turns"]');
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
  assert.ok((await sysLines(page)).includes('You were murdered in the night. You were a Faithful.'));
  assert.equal(await page.evaluate(() => Game.recordText().includes('Breakfast. Joe was murdered in the night. Joe was a Faithful.')), true, 'the record names the player');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.seat .seat-tag')].every(t => t.textContent)), 'every role is shown to the one who is out');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#acts .btn')].map(b => b.textContent)), ['Watch them talk', 'Go to the vote', 'Skip to the end']);
  assert.equal(await page.evaluate(() => document.querySelector('#say-line').hidden), true, 'the dead do not talk');
  // Leave and come back.
  await page.click('#btn-quit');
  await page.click('dialog .btn.primary');
  assert.equal(await page.evaluate(() => document.querySelector('#home-continue-row').hidden), false);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.match(await page.textContent('#home-continue-note'), /^Joe, Faithful · Day 1 · 7 still in$/);
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
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); for (const p of Game.state.players) p.type = 'proper'; });
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
  // Each is there whole, on as many lines as it takes (the owner, of one cut short with three dots: "this is not good"), and the chat still shows its newest message above the list.
  const whole = await page.evaluate(() => { const x = document.querySelector('#asks .ask-text'); const w = document.querySelector('#log-wrap'); const c = getComputedStyle(x); return { overflow: c.textOverflow, space: c.whiteSpace, cut: x.scrollWidth > x.clientWidth + 1 && c.overflow !== 'visible', shown: getComputedStyle(document.querySelector('#asks .ask-who .visually-hidden')).position, gap: Math.round(w.scrollHeight - w.scrollTop - w.clientHeight) }; });
  assert.deepEqual([whole.overflow, whole.space, whole.cut, whole.shown], ['clip', 'normal', false, 'absolute'], JSON.stringify(whole));
  assert.ok(whole.gap <= 2, 'the chat is at its newest message: ' + whole.gap);
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

s.test('they play like people who are trying to win, and write like people in a group chat: each seat has a temperament and a way of typing of its own, is told how much to send each turn (sometimes only a reaction) and is cut off if it goes on; nobody but the seats speaks', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-deck [data-v="classic"]');
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
  const tempers = await page.evaluate(() => Object.values(Game.PERSONAS).map(x => x.play).join(' '));
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
  const dealt = await page.evaluate(() => ({ ways: Game.state.players.filter(p => !p.you).map(p => Game.PERSONAS[p.id].play), types: Game.state.players.filter(p => !p.you).map(p => p.type), hands: Game.TYPES.map(x => x.id), chat: Game.state.players.filter(p => !p.you).map(p => [p.chat, Game.PERSONAS[p.id].chat]) }));
  assert.equal(new Set(dealt.ways).size, 7, 'each of the seven has a way of playing of their own');
  assert.deepEqual([...ways].filter(w => !dealt.ways.includes(w)), [], 'and it is what that seat is given');
  assert.ok(dealt.types.every(x => dealt.hands.includes(x)) && new Set(dealt.types).size === 7, 'no two of the seven type alike: ' + dealt.types.join(','));
  assert.ok(dealt.chat.every(c => c[0] === c[1]), 'and each talks as much as they always do');
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
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  // (A Traitor, so the night is the player's to decide and they are at the table in the morning.)
  await page.click('#f-deck [data-v="classic"]');
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
  // Said to everyone: two of them answer at once, neither having seen the other's.
  for (const u of round.slice(0, 2)) assert.ok(u.includes(`Joe has just said, to everyone: "${words}" Answer Joe: take up what they said (agree, argue with it, or answer the question), speaking to them.`), u.slice(-400));
  assert.notEqual(/^YOUR SEAT: (.+)\.$/m.exec(round[0])[1], /^YOUR SEAT: (.+)\.$/m.exec(round[1])[1], 'two different people');
  assert.equal(round[0].includes('Joe: "' + words + '"'), true, 'and it is in the record they are given');
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
  assert.equal(after.length, 2);
  for (const x of after) assert.match(x, /\bJoe\b|\byou\b/i, 'said to the player: ' + x);
});

s.test('a live table talks on by itself until the vote: nobody waits for the player, who speaks whenever they like; nobody speaks twice running, some say a lot and some little, the morning opens on the night, and there are no rounds; what someone said can be tapped to aim at them', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, role: 'town', wild: false, live: true });
  await begin(page);
  await page.evaluate(() => { Game.App.speed = 0.02; Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
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
  for (const x of day.texts.slice(0, 2)) assert.match(x.toLowerCase(), new RegExp(`^(not ${day.victim}|oh no|damn|${day.victim}\\?\\? really|well that is bad|great\\. just great)$`), 'the morning opens on the night: ' + x);
  assert.match(day.sys[day.sys.length - 1], /^(That is enough talk\. The table votes\.|Most of the table wants to vote\. The table votes\.)$/);
  assert.equal(await page.evaluate(() => document.querySelector('#typing').hidden), true);
});

s.test('at a live table with Claude: whoever is up is shown typing (two at once when the player spoke to everyone, neither seeing the other\'s), the player\'s words go in while they type, a second message sits under the first with no name, the player\'s are on the right, and what was being typed when the vote is called is dropped', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies, { delay: 150, more: true }) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  // (A Traitor, so the night is the player's to decide and they are at the table in the morning.)
  await page.click('#f-deck [data-v="classic"]');
  await page.click('#f-role [data-v="knife"]');
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; });
  assert.equal(await page.evaluate(() => document.querySelector('#f-pace [aria-pressed="true"]').dataset.v), 'live', 'a live table is what is offered first');
  await page.click('#btn-new');
  await page.click('dialog .btn.primary');
  await begin(page);
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.state.players.find(p => p.alive && p.role === 'town').id)}"]`);
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.talking && !document.querySelector('#typing').hidden);
  await page.evaluate(() => { Game.state.clock = 60; });
  const typing = await page.evaluate(() => ({ faces: document.querySelectorAll('#typing .say-face').length, seats: document.querySelectorAll('.seat[data-typing="1"]').length, dots: document.querySelectorAll('#typing .typing-dots i').length, busy: Game.busy, live: Game.state.live }));
  assert.ok(typing.faces >= 1 && typing.faces === typing.seats && typing.dots === 3 && !typing.busy && typing.live, JSON.stringify(typing));
  // The player speaks while they type.
  const words = "it's a pain in the ass we lost the witness day 1 ffs";
  await page.fill('#say', words);
  await page.click('#btn-say');
  assert.ok(await page.evaluate(w => Game.state.log.some(e => e.who === 'you' && e.text === w), words), 'in at once');
  await page.waitForFunction(() => document.querySelectorAll('#typing .say-face').length === 2, null, { timeout: 10000 });
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const answers = () => bodies.filter(b => b.body.output_config.format.schema.required.includes('stance') && userOf(b).includes(`Joe has just said, to everyone: "${words}" Answer Joe:`));
  for (let i = 0; i < 40 && answers().length < 2; i++) await page.waitForTimeout(50);
  assert.equal(answers().length, 2, 'two of them answer');
  assert.ok(answers().every(b => !userOf(b).includes('You were too quiet') || userOf(answers()[0]).split('TODAY SO FAR')[0] !== undefined));
  assert.equal(userOf(answers()[0]).split('\n\nSTILL IN')[0], userOf(answers()[1]).split('\n\nSTILL IN')[0], 'each was given the same record: neither saw the other\'s answer');
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
  await page.click('#f-deck [data-v="classic"]');
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
  assert.ok(day1.some(u => /^HOW YOU FEEL: sore at \w+$/m.test(u)), 'what a seat said it feels is given back to it');
  assert.ok(day1.every(u => !/Yesterday/.test(u)));
  // The stand-in has every seat vote for the first name still in that is not its own: the table goes for the player, a Traitor.
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
  const town = day2.find(u => /YOUR SECRET ROLE: (Faithful|Witness|Watch|Fool|Hothead)/.test(u));
  assert.match(town, /^WHAT YOU ARE CARRYING: .*Yesterday you voted for Joe, who was a Traitor\. You called it\./m);
  const mate = day2.find(u => /YOUR SECRET ROLE: Traitor/.test(u));
  if (mate) assert.doesNotMatch(mate, /You called it|You got that one wrong/, 'a Traitor is not told how to feel about a vote it knew the truth of');
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

s.test('on a phone the talk is the chat\'s: while the table talks it is a strip of the others\' faces over one line with the count and Call the vote, and the round table is back for the night, the morning and the vote', async h => {
  const page = await open(h);
  const look = () => page.evaluate(() => {
    const box = x => document.querySelector(x).getBoundingClientRect();
    const seats = [...document.querySelectorAll('.seat')].filter(x => x.offsetParent);
    return { mode: document.querySelector('#screen-game').dataset.table, area: Math.round(box('.table-area').height), log: Math.round(box('#log-wrap').height), felt: getComputedStyle(document.querySelector('.felt')).display,
      you: getComputedStyle(document.querySelector('.seat[data-you="1"]')).display, shown: seats.length, rows: new Set(seats.map(x => Math.round(x.getBoundingClientRect().top))).size,
      small: seats.filter(x => { const r = x.getBoundingClientRect(); return r.width < 44 || r.height < 44 || r.left < 0 || r.right > window.innerWidth; }).length,
      cut: seats.filter(x => { const n = x.querySelector('.seat-name'); return n.scrollWidth > n.clientWidth; }).map(x => x.querySelector('.seat-name').textContent) };
  });
  await sit(page, { seed: 91, role: 'town', wild: false });
  const role = await look();
  assert.deepEqual([role.mode, role.felt, role.shown, role.you], ['round', 'block', 8, 'grid'], 'the role: the round table, the player at the foot of it');
  await begin(page);
  const night = await look();
  assert.deepEqual([night.mode, night.felt, night.shown], ['round', 'block', 8], 'the night: the round table');
  // The morning is staged on the round table; the strip comes when the talk opens.
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); window.__morning = null; const stage = Game.UI.stage; Game.UI.stage = function (k, text) { const r = stage.apply(this, arguments); if (text === 'Breakfast.') window.__morning = [Game.state.phase, document.querySelector('#screen-game').dataset.table]; return r; }; });
  await page.click('#mid-go');
  await settle(page);
  assert.deepEqual(await page.evaluate(() => window.__morning), ['talk', 'round'], 'the morning, said in the middle of the round table');
  const talk = await look();
  assert.deepEqual([talk.mode, talk.felt, talk.you, talk.shown, talk.rows, talk.small], ['strip', 'none', 'none', 7, 1, 0], 'the talk: the other seven in one row, each big enough to tap');
  assert.deepEqual(talk.cut, [], 'no name cut short');
  assert.ok(talk.area <= 130 && night.area - talk.area >= 110, `the strip is less than half the table: ${talk.area} against ${night.area}`);
  assert.ok(talk.log >= 320, 'and the chat has the room: ' + talk.log);
  // The count and Call the vote are one line under the faces; the day is in the top bar.
  const line = await page.evaluate(() => { const r = x => document.querySelector(x).getBoundingClientRect(); const a = r('#mid-ready'); const b = r('#btn-vote'); return { text: document.querySelector('#mid-ready').textContent, day: getComputedStyle(document.querySelector('#mid .mid-k')).display, side: a.right <= b.left && a.top < b.bottom && a.bottom > b.top, under: a.top >= Math.max(...[...document.querySelectorAll('.seat')].filter(x => x.offsetParent).map(x => x.getBoundingClientRect().top + 34)), btn: Math.round(b.height), bar: document.querySelector('#tb-phase').textContent }; });
  assert.match(line.text, /^7 still in/);
  assert.deepEqual([line.day, line.side, line.under, line.btn >= 44], ['none', true, true, true]);
  assert.match(line.bar, /Day 1$/);
  // A face in the strip is the seat it was: a tap picks them (the row with the marks, the quick replies aimed), and the marks on a seat are drawn on it.
  const other = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you));
  await page.click(`.seat[data-id="${other.id}"]`);
  assert.equal(await page.textContent('#sheet .sheet-name'), other.name);
  assert.equal(await page.textContent('#chips .chips-to'), `To ${other.first}:`);
  await page.click('#sheet [data-mark="sus"]');
  assert.equal(await page.getAttribute(`.seat[data-id="${other.id}"]`, 'data-mark'), 'sus');
  await page.evaluate(id => { Game.UI.emote(id, '!'); Game.UI.typing([id]); Game.state.asks.push({ id: 99, who: id, kind: 'asks', text: 'well?' }); Game.UI.renderAsks(); }, other.id);
  const marks = await page.evaluate(id => { const s = document.querySelector(`.seat[data-id="${id}"]`); const r = s.getBoundingClientRect(); const e = s.querySelector('.seat-emote').getBoundingClientRect(); const q = getComputedStyle(s, '::after'); return { typing: s.dataset.typing, asking: s.dataset.asking, q: q.content, emote: e.left >= r.left - 1 && e.right <= r.right + 1 }; }, other.id);
  assert.deepEqual(marks, { typing: '1', asking: '1', q: '"?"', emote: true });
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.evaluate(() => Game.UI.typing([]));
  // The vote: the round table again, every seat on it.
  await page.click(`.seat[data-id="${other.id}"]`);
  await page.click('#btn-vote');
  const vote = await look();
  assert.deepEqual([vote.mode, vote.felt, vote.shown, vote.you], ['round', 'block', 8, 'grid'], 'the vote: the round table');
  // Ten at the table: two rows of the nine others on a phone, still big enough to tap; a narrow phone keeps eight in one row.
  await page.evaluate(() => Game.App.quit());
  await sit(page, { seed: 51, size: 10, role: 'town' });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
  await page.click('#mid-go');
  await settle(page);
  const ten = await look();
  assert.deepEqual([ten.mode, ten.shown, ten.rows, ten.small], ['strip', 9, 2, 0], 'ten seats: two rows');
  assert.deepEqual(ten.cut, []);
  assert.ok(ten.log >= 260, 'the chat still has the room: ' + ten.log);
  await page.setViewportSize({ width: 320, height: 568 });
  const narrowTen = await look();
  assert.deepEqual([narrowTen.shown, narrowTen.rows, narrowTen.small], [9, 2, 0], 'ten seats at 320');
  await page.evaluate(() => Game.App.quit());
  await sit(page, { seed: 91, role: 'town', wild: false });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
  await page.click('#mid-go');
  await settle(page);
  const narrow = await look();
  assert.deepEqual([narrow.mode, narrow.shown, narrow.rows, narrow.small], ['strip', 7, 1, 0], 'eight seats at 320: one row');
  assert.deepEqual(await overflowReport(page, 320), []);
  // A laptop keeps the round table through the talk.
  await page.setViewportSize(LAPTOP);
  const wide = await look();
  assert.deepEqual([wide.felt, wide.shown, wide.you], ['block', 8, 'grid'], 'a laptop: the round table');
});

s.test('the seats are told the table is all there is: nothing about where anyone was or was going, nothing to ask the player about but how they play', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.fill('#f-key', 'sk-ant-test-key');
  await page.fill('#f-name', 'Joe');
  await page.click('#f-deck [data-v="classic"]');
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
  assert.match(sys, /Talk about the game and nothing else: this table, tonight, who is lying\. Nothing about a town, anybody's work, family, money or past, the weather, or any life outside this room/);
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
    const round = await page.evaluate(() => { const t = document.querySelector('#table').getBoundingClientRect(); return [...document.querySelectorAll('.seat')].map(x => { const r = x.getBoundingClientRect(); return !!x.offsetParent && r.left >= -1 && r.right <= window.innerWidth + 1 && r.width >= 44 && r.height >= 44 && r.top >= t.top - 60; }); });
    assert.ok(round.length === 10 && round.every(Boolean), 'at night: ten seats round the table, each on screen and big enough to tap');
    await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town').pop(); });
    await page.click('#mid-go');
    await settle(page);
    const other = await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id);
    await page.click(`.seat[data-id="${other}"]`);
    assert.deepEqual(await overflowReport(page, w), [], 'the talk, a seat picked');
    assert.deepEqual(await small(), [], 'the game\'s buttons');
    // (On a phone the talk's table is a strip of the other nine; on a laptop it is the round table, the player's seat too.)
    const seats = await page.evaluate(() => { const t = document.querySelector('#table').getBoundingClientRect(); return [...document.querySelectorAll('.seat')].filter(x => x.offsetParent).map(x => { const r = x.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1 && r.width >= 44 && r.height >= 44 && r.top >= t.top - 60; }); });
    assert.ok(seats.length === (w < 700 ? 9 : 10) && seats.every(Boolean), 'every seat shown is on screen and big enough to tap');
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

/* ----- The house deal (the owner, after a few nights: "1 or 2 games and it
   gets boring"). The same deck every night was the same game every night,
   and nothing was kept from one to the next. So: a deck the house shuffles
   afresh (the Bouncer, the Listener, the Old Friends, the Drunk and the
   Turncoat beside the Watch, the Fool and the Hothead), one house rule a
   night, a side bet of the player's own, a tab the house keeps, and the
   people sat with before remembering the last time. ----- */
/* The first seed whose deal is the one wanted (the deal is seeded, so the search finds the same seed every run). want: { me: the player's role, has: cards in the deck, not: cards not in it }. */
const seedFor = (page, opts, want) => page.evaluate(([o, w]) => {
  for (let seed = 1; seed < 6000; seed++) {
    const g = Game.Rules.deal(Object.assign({ seed, mode: 'demo', name: 'Joe', deck: 'house', rule: 'none', bet: 'none' }, o));
    if (w.me && g.players[0].role !== w.me) continue;
    if (w.seat1 && g.players[1].role !== w.seat1) continue;
    if ((w.has || []).some(c => !g.cards[c]) || (w.not || []).some(c => g.cards[c])) continue;
    return seed;
  }
  throw new Error('no seed deals ' + JSON.stringify(w));
}, [opts || {}, want]);
/* Play the table out to its end through the buttons: sleep (or the night's first choice), let them talk, vote for the first seat still in. */
const playOut = async (page, opts) => {
  for (let i = 0; i < 90; i++) {
    const g = await st(page);
    if (g.phase === 'over') return g;
    if (g.phase === 'role') await begin(page);
    else if (g.phase === 'night') {
      if (!(await page.$('#mid-go'))) await page.click(`.seat[data-id="${await page.evaluate(() => { const j = Game.UI.nightJob(); return Game.state.players.find(p => j.ok(p)).id; })}"]`);
      await page.click('#mid-go');
      await settle(page, opts);
    } else if (g.phase === 'talk') { if (g.said < 3) await pass(page); else await page.click('#btn-vote'); }
    else if (g.phase === 'vote') { if (g.me.alive) await page.click(`.seat[data-id="${g.players.find(p => p.alive && p.id !== 'you').id}"]`); await page.click('#mid-go'); await settle(page, opts); }
  }
  throw new Error('the table never finished');
};

s.test('the house deals a different table every night: the Traitors and a Witness, wild cards from its own deck to fill their seats, no more trouble than the size allows, a house rule and a side bet; the same seed the same night; a card asked for is dealt in', async h => {
  const page = await open(h);
  const out = await page.evaluate(() => {
    const R = Game.Rules;
    const res = { bad: [], decks: {}, cards: {}, rules: {}, bets: {} };
    for (const size of [6, 8, 10]) {
      res.decks[size] = new Set(); res.cards[size] = new Set();
      for (let seed = 1; seed <= 240; seed++) {
        const g = R.deal({ seed, size, mode: 'demo', deck: 'house' });
        const n = r => g.players.filter(p => p.role === r).length;
        const H = R.HOUSE[size];
        const seats = Object.values(g.cards).reduce((a, b) => a + b, 0);
        const trouble = ['drunk', 'turncoat', 'fool'].filter(c => g.cards[c]).length;
        const ok = n('knife') === R.SIZES[size].knife && n('witness') === 1 && seats === H.seats && trouble <= H.trouble && Object.keys(g.cards).every(c => H.pool.includes(c) && n(c) === g.cards[c]) && (g.cards.friend || 0) % 2 === 0
          && n('town') === size - R.SIZES[size].knife - 1 - seats && g.deck === 'house' && g.wild === true && !!R.RULES[g.rule] && Game.BETS.some(b => b.id === g.bet && b.for(g.players[0].role === 'drunk' ? 'witness' : g.players[0].role))
          && (g.rule !== 'vouch' || g.players.find(p => p.id === g.vouched).role !== 'knife') && (g.rule === 'vouch') === !!g.vouched;
        if (!ok) res.bad.push([size, seed, g.cards, g.rule, g.bet]);
        res.decks[size].add(Object.keys(g.cards).sort().join('+')); Object.keys(g.cards).forEach(c => res.cards[size].add(c)); res.rules[g.rule] = 1; res.bets[g.bet] = 1;
      }
      res.decks[size] = res.decks[size].size; res.cards[size] = [...res.cards[size]].sort();
    }
    const sig = g => JSON.stringify([g.players.map(p => [p.id, p.role]), g.cards, g.rule, g.bet, g.vouched]);
    res.same = sig(R.deal({ seed: 77, size: 8, deck: 'house' })) === sig(R.deal({ seed: 77, size: 8, deck: 'house' }));
    res.other = sig(R.deal({ seed: 77, size: 8, deck: 'house' })) !== sig(R.deal({ seed: 78, size: 8, deck: 'house' }));
    // A card asked for is dealt in and given; 'wild' gives one of tonight's but never the Drunk; what the size has no room for is not dealt.
    res.asked = ['bouncer', 'listener', 'friend', 'turncoat', 'watch', 'fool', 'hothead'].map(role => { const g = R.deal({ seed: 9, size: 8, deck: 'house', role }); return [g.players[0].role, !!g.cards[role]]; });
    res.wild = []; for (let seed = 1; seed <= 60; seed++) { const g = R.deal({ seed, size: 8, deck: 'house', role: 'wild' }); res.wild.push(g.players[0].role !== 'drunk' && !!g.cards[g.players[0].role]); }
    res.drunkAsked = R.deal({ seed: 9, size: 8, deck: 'house', role: 'drunk' }).players[0].role === 'drunk' && false;
    res.small = [R.deal({ seed: 9, size: 6, deck: 'house', role: 'turncoat' }).cards.turncoat || 0, R.deal({ seed: 9, size: 6, deck: 'house', role: 'friend' }).cards.friend || 0];
    // The other decks are what they were, with no house rule; a rule can be asked for at any table.
    const c = R.deal({ seed: 5, size: 10 }); const p = R.deal({ seed: 5, size: 10, wild: false }); const p2 = R.deal({ seed: 5, size: 10, deck: 'plain' });
    res.old = [c.deck, c.cards, c.rule, p.deck, p.cards, p.rule, p2.deck, R.deal({ seed: 5, size: 8, rule: 'dark' }).rule, R.deal({ seed: 5, size: 8, deck: 'house', rule: 'none' }).rule];
    // The regulars: three of the people sat with before are given a seat (two at six), and with none the table is the seed's own.
    const base = R.deal({ seed: 5, size: 8, deck: 'house' }).players.map(q => q.id);
    const strangers = Game.CAST.map(x => x.id).filter(id => !base.includes(id)).slice(0, 6);
    const withRegs = R.deal({ seed: 5, size: 8, deck: 'house', regulars: strangers }).players.map(q => q.id);
    res.regs = [withRegs.filter(id => strangers.includes(id)).length, R.deal({ seed: 5, size: 6, deck: 'house', regulars: strangers }).players.filter(q => strangers.includes(q.id)).length, new Set(withRegs).size,
      JSON.stringify(R.deal({ seed: 5, size: 8, deck: 'house', regulars: [] }).players.map(q => [q.id, q.role])) === JSON.stringify(R.deal({ seed: 5, size: 8, deck: 'house' }).players.map(q => [q.id, q.role]))];
    return res;
  });
  assert.deepEqual(out.bad, [], 'every house deal is a legal one');
  assert.deepEqual(out.cards[6], ['bouncer', 'drunk', 'hothead', 'listener', 'watch'], 'six seats: no Fool, no Turncoat, no Old Friends');
  assert.deepEqual(out.cards[8], ['bouncer', 'drunk', 'fool', 'friend', 'hothead', 'listener', 'turncoat', 'watch']);
  assert.ok(out.decks[6] >= 8 && out.decks[8] >= 20 && out.decks[10] >= 20, 'many different decks: ' + JSON.stringify(out.decks));
  assert.deepEqual(Object.keys(out.rules).sort(), ['ballot', 'both', 'dark', 'note', 'vouch'], 'every house rule comes up');
  assert.ok(Object.keys(out.bets).length >= 8, 'and many different side bets: ' + Object.keys(out.bets));
  assert.ok(out.same && out.other, 'seeded');
  assert.deepEqual(out.asked, ['bouncer', 'listener', 'friend', 'turncoat', 'watch', 'fool', 'hothead'].map(r => [r, true]));
  assert.ok(out.wild.every(Boolean), 'a wild card asked for is one of tonight\'s, and never the Drunk');
  assert.deepEqual(out.small, [0, 0]);
  assert.deepEqual(out.old, ['classic', { watch: 1, fool: 1, hothead: 1 }, null, 'plain', { watch: 1 }, null, 'plain', 'dark', null]);
  assert.deepEqual(out.regs, [3, 2, 8, true]);
});

s.test('the Drunk is told Witness and sees as often wrong as right, until the game is over; the Witness is told there is a Drunk about', async h => {
  const page = await open(h);
  const seed = await seedFor(page, { size: 8 }, { me: 'drunk' });
  await page.evaluate(o => { Game.App.speed = 0; Game.App.quiet = true; Game.App.newGame(Object.assign({ size: 8, mode: 'demo', name: 'Joe', live: false, deck: 'house', rule: 'none', bet: 'found' }, o)); }, { seed });
  const card = await page.evaluate(() => ({ name: document.querySelector('dialog .role-name').textContent, text: document.querySelector('dialog').textContent, role: Game.state.players[0].role }));
  assert.deepEqual([card.role, card.name], ['drunk', 'Witness'], 'the Drunk\'s card says Witness');
  assert.match(card.text, /There is a Drunk in tonight's deck who was told exactly this\. You cannot tell which of the two you are\./);
  assert.match(card.text, /8 at the table: 2 Traitors, a Witness, .*a Drunk.*, the rest Faithful\./);
  assert.match(card.text, /Your side bet: See a Traitor in the night, and see them banished\./);
  await page.click('dialog .btn.primary');
  assert.match(await page.textContent('#tb-phase'), /^Witness · /);
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Witness');
  await page.click('#mid-go');
  await settle(page);
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Tap who you watch tonight.');
  const knife = await page.evaluate(() => Game.state.players.find(p => p.role === 'knife'));
  await page.click(`.seat[data-id="${knife.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  const seen = await page.evaluate(id => ({ check: Game.state.players[0].mem.checks[0], line: Game.state.log.find(e => e.kind === 'private' && /^You watched/.test(e.text)).text, tag: document.querySelector(`.seat[data-id="${id}"] .seat-tag`).textContent }), knife.id);
  assert.equal(seen.line, `You watched ${knife.name} in the night. ${knife.first} is ${seen.check.knife ? 'a Traitor' : 'not a Traitor'}.`);
  assert.equal(seen.tag, seen.check.knife ? 'Traitor' : 'Not a Traitor', 'and what they were told is what the table shows them');
  // Over many nights: wrong about as often as right (a Witness is never wrong).
  const coin = await page.evaluate(async () => {
    const run = async role => {
      let wrong = 0;
      for (let seed = 1; seed <= 40; seed++) {
        Game.App.newGame({ seed, size: 8, mode: 'demo', name: 'Joe', live: false, wild: false, role: 'witness', bet: 'none' });
        document.querySelector('#dlg').close();
        Game.state.players[0].role = role;
        await Game.App.begin();
        const k = Game.state.players.find(p => p.role === 'knife');
        await Game.App.night(k.id);
        if (!Game.state.players[0].mem.checks[0].knife) wrong += 1;
      }
      return wrong;
    };
    return [await run('drunk'), await run('witness')];
  });
  assert.ok(coin[0] >= 10 && coin[0] <= 30, 'of forty Traitors watched, the Drunk was told wrong about ' + coin[0]);
  assert.equal(coin[1], 0);
  // Once it is over the card is turned: the Drunk.
  await page.evaluate(() => { const g = Game.state; g.players[0].role = 'drunk'; g.players[0].alive = false; g.players[0].out = { how: 'night', day: 1 }; Game.UI.render(); });
  assert.match(await page.textContent('#tb-phase'), /^Drunk \(out\) · /);
  // A real Witness at a table with a Drunk is told the same.
  const seed2 = await seedFor(page, { size: 8, role: 'witness' }, { me: 'witness', has: ['drunk'] });
  await page.evaluate(o => { Game.App.newGame(Object.assign({ size: 8, mode: 'demo', name: 'Joe', live: false, deck: 'house', rule: 'none', role: 'witness' }, o)); }, { seed: seed2 });
  assert.match(await page.textContent('dialog'), /There is a Drunk in tonight's deck who was told exactly this/);
  const told = await page.evaluate(() => { const d = Game.state.players.find(p => p.role === 'drunk'); return { secret: Game.Prompts.secret(d), sys: Game.Prompts.system() }; });
  assert.match(told.secret, /YOUR SECRET ROLE: Witness \(Faithful\)\./);
  assert.doesNotMatch(told.secret, /Drunk/, 'a seat that is the Drunk is told it is the Witness, and nothing else');
  assert.match(told.sys, /One of the Faithful is the Drunk, who has been told they are the Witness and is not/);
});

s.test('the Bouncer has one throw: kept for another night or used, what the one thrown out was is shown in the morning, a door the Watch keeps holds against it, and a seat that is the Bouncer waits for a day\'s talk', async h => {
  const page = await open(h);
  const seed = await seedFor(page, { size: 8 }, { me: 'bouncer', not: ['turncoat', 'hothead'] });
  await sit(page, { seed, deck: 'house', rule: 'none', bet: 'thrown' });
  await begin(page);
  // Not tonight.
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#mid .mid-t').textContent, document.querySelector('#mid-go').textContent]), ['Tap who you throw out tonight, or keep it. You only get the one.', 'Not tonight']);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town')[0] || Game.state.players.filter(p => p.alive && !p.you && p.role !== 'knife')[0]; });
  await page.click('#mid-go');
  await settle(page);
  let g = await st(page);
  assert.deepEqual([g.phase, g.me.used === true, g.players.filter(p => p.out && p.out.how === 'thrown').length], ['talk', false, 0]);
  // Day one passes with a tie; on night two the throw is used on a Traitor.
  await page.evaluate(() => { const live = Game.state.players.filter(p => p.alive); Game.Bots.vote = p => { const i = live.indexOf(p); const t = live[(i + 1) % live.length]; return { vote: t, text: 'Them.' }; }; });
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${g.players.find(p => p.alive && p.id !== 'you').id}"]`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  assert.deepEqual([g.phase, g.day], ['night', 2]);
  const knife = g.players.find(p => p.role === 'knife' && p.alive);
  await page.click(`.seat[data-id="${knife.id}"]`);
  assert.equal(await page.textContent('#mid-go'), `Throw out ${knife.first}`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  assert.deepEqual(g.players.find(p => p.id === knife.id).out, { how: 'thrown', day: 2 });
  assert.ok((await sysLines(page, 'death')).includes(`${knife.name} was thrown out in the night by the Bouncer. ${knife.first} was a Traitor.`));
  assert.match(await page.evaluate(() => Game.recordText()), new RegExp(`^Breakfast\\. ${knife.name} was thrown out in the night by the Bouncer\\. ${knife.first} was a Traitor\\.$`, 'm'));
  assert.deepEqual(await page.evaluate(() => [Game.state.players[0].used, Game.state.thrown.map(t => [t.id, t.by]), Game.UI.nightJob()]), [true, [[knife.id, 'you']], null]);
  // The side bet is settled when it is over: a Traitor was thrown out.
  if (g.phase !== 'over') { await page.evaluate(() => { Game.Bots.vote = p => { const k = Game.state.players.find(q => q.alive && q.role === 'knife' && q !== p) || Game.state.players.find(q => q.alive && q !== p); return { vote: k, text: 'Them.' }; }; }); await playOut(page); }
  assert.equal(await page.evaluate(() => Game.state.betWon), true);
  // A seat that is the Bouncer: not on the first night; then whoever it has settled on, unless the Watch is keeping that door.
  const seed2 = await seedFor(page, { size: 8, role: 'watch' }, { me: 'watch', has: ['bouncer'], not: ['turncoat', 'hothead'] });
  await sit(page, { seed: seed2, deck: 'house', rule: 'none', role: 'watch', bet: 'none' });
  await begin(page);
  const b = await page.evaluate(() => { const x = Game.state.players.find(p => p.role === 'bouncer'); const t = Game.state.players.find(p => p.alive && !p.you && p.role === 'knife'); x.mem.suspect = t.id; return { id: x.id, first: Game.Bots.bounce(x), t: t.id, tName: t.name }; });
  assert.equal(b.first, null, 'nothing to go on yet on the first night');
  await page.evaluate(([bid, tid]) => { Game.Bots.bounce = () => Game.state.players.find(p => p.id === tid); Game.Bots.kill = () => Game.state.players.find(p => p.alive && !p.you && p.role === 'town'); }, [b.id, b.t]);
  await page.click(`.seat[data-id="${b.t}"]`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  assert.equal(g.players.find(p => p.id === b.t).alive, true, 'the door the Watch kept held against the Bouncer too');
  assert.equal(await page.evaluate(id => Game.state.players.find(p => p.id === id).used, b.id), true, 'and that was the Bouncer\'s one');
  assert.ok((await sysLines(page)).includes('Someone else was come for in the night, and was turned away.'));
});

s.test('the Turncoat goes over when the Traitors come: nobody is taken, the morning looks like any quiet one, and from then on they are a Traitor, know the Traitors and win with them', async h => {
  const page = await open(h);
  const seed = await seedFor(page, { size: 8 }, { me: 'turncoat', not: ['watch', 'bouncer'] });
  await sit(page, { seed, deck: 'house', rule: 'none', bet: 'none' });
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Turncoat');
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players[0]; });
  await page.click('#mid-go');
  await settle(page);
  const g = await st(page);
  const knives = g.players.filter(p => p.role === 'knife');
  assert.deepEqual([g.phase, g.players.every(p => p.alive), g.me.role, g.me.was, g.me.turned, knives.length], ['talk', true, 'knife', 'turncoat', 1, 3]);
  const lines = await page.evaluate(() => ({ pub: Game.state.log.filter(e => e.t === 'sys' && e.day === 1 && !e.priv && e.kind === 'sys').map(e => e.text), priv: Game.state.log.filter(e => e.priv).map(e => e.text), record: Game.recordText(),
    tags: Object.fromEntries([...document.querySelectorAll('.seat')].map(x => [x.dataset.id, x.querySelector('.seat-tag').textContent])), bar: document.querySelector('#tb-phase').textContent }));
  assert.ok(lines.pub.includes('Everyone is still here.'), 'the morning is any quiet morning');
  assert.ok(lines.priv.some(t => /^The Traitors came for you in the night, and you are the Turncoat: you did not go\. You are a Traitor now, with .+, and you win with them\.$/.test(t)));
  assert.doesNotMatch(lines.record, /Turncoat: you did not go|came for you/, 'and nothing of it is in the record');
  assert.ok(knives.every(k => lines.tags[k.id] === 'Traitor'), 'the Traitors are shown to them now');
  assert.match(lines.bar, /^Traitor · /);
  // The Traitors are told who came over; and a seat that went over is told what it was and what it is.
  const told = await page.evaluate(() => { const k = Game.state.players.find(p => p.role === 'knife' && !p.you); const mine = Game.Prompts.secret(k); const me = Game.state.players[0]; me.you = false; let own = ''; try { own = Game.Prompts.secret(me); } finally { me.you = true; } return { mine, own }; });
  assert.match(told.mine, /Joe was the Turncoat: the Traitors went for Joe on night 1, and Joe is one of you now\./);
  assert.match(told.own, /YOUR SECRET ROLE: Traitor\. Your fellow Traitors: .+\.\nYou were the Turncoat, and a Faithful, until the Traitors came for you on night 1\. You are a Traitor now and you win with them\./);
  // They win with the Traitors now.
  const end = await page.evaluate(() => { Game.state.winner = 'knives'; Game.state.phase = 'over'; Game.UI.render(); return { mid: document.querySelector('#mid .mid-k').textContent }; });
  assert.equal(end.mid, 'You won');
  await page.click('#mid-reveal');
  assert.match(await page.evaluate(() => [...document.querySelectorAll('dialog .reveal-row')].find(r => /\(you\)/.test(r.textContent)).querySelector('.reveal-name').textContent), /Joe \(you\)Traitorwas the Turncoat/);
});

s.test('the Listener hears how many Traitors sit either side of them, the nearest still in; Old Friends know each other; and both are in the rules every seat is given', async h => {
  const page = await open(h);
  const seed = await seedFor(page, { size: 8 }, { me: 'listener', has: ['friend'] });
  await sit(page, { seed, deck: 'house', rule: 'none', bet: 'none' });
  await begin(page);
  // Nobody beside the player goes tonight, so what is heard is about the two sat there.
  await page.evaluate(() => { const n = Game.state.players.length; const far = Game.state.players.filter((p, i) => i > 1 && i < n - 1 && p.role !== 'knife' && p.role !== 'friend'); Game.Bots.kill = () => far[0]; });
  await page.click('#mid-go');
  await settle(page);
  const heard = await page.evaluate(() => { const g = Game.state; const n = g.players.length; return { h: g.players[0].mem.heard[0], left: g.players[1], right: g.players[n - 1], line: g.log.find(e => e.kind === 'private' && /^You listen/.test(e.text)).text, beside: Game.Rules.beside('you') }; });
  const k = [heard.left, heard.right].filter(p => p.role === 'knife').length;
  assert.deepEqual([heard.h.ids, heard.h.n, heard.h.day], [[heard.left.id, heard.right.id], k, 1]);
  assert.equal(heard.line, `You listen to either side of you: ${k === 0 ? `neither ${heard.left.first} nor ${heard.right.first} is a Traitor` : k === 1 ? `one of ${heard.left.first} and ${heard.right.first} is a Traitor` : `${heard.left.first} and ${heard.right.first} are both Traitors`}.`);
  // With the one on the left out, it is the next one round.
  const next = await page.evaluate(() => { const g = Game.state; g.players[1].alive = false; const b = Game.Rules.beside('you'); g.players[1].alive = true; return [b, g.players.slice(2).find(p => p.alive).id, g.players[g.players.length - 1].id]; });
  assert.deepEqual(next[0], [next[1], next[2]]);
  // A seat that is the Listener is told what it heard, and the rules give the order round the table.
  const told = await page.evaluate(() => { const g = Game.state; const me = g.players[0]; me.you = false; g.players[1].you = true; let own = ''; let sys = ''; try { own = Game.Prompts.secret(me); sys = Game.Prompts.system(); } finally { me.you = true; g.players[1].you = false; } const f = g.players.filter(p => p.role === 'friend'); return { own, sys, f: f.map(p => [p.name, p.first, Game.Prompts.secret(p), p.mem.sus[f.find(q => q !== p).id]]) }; });
  assert.match(told.own, /YOUR SECRET ROLE: Listener \(Faithful\)\.\nWhat you have heard: morning 1, (neither \w+ nor \w+ is a Traitor|one of \w+ and \w+ is a Traitor|\w+ and \w+ are both Traitors)\./);
  assert.match(told.sys, /One of the Faithful is the Listener, .* Round the table, in order: Joe, (\w+, ){6}\w+ \(and \w+ sits beside Joe\)\./);
  assert.match(told.sys, /Two of the Faithful are Old Friends: they know each other/);
  assert.equal(told.f.length, 2);
  assert.match(told.f[0][2], new RegExp(`YOUR SECRET ROLE: Old Friend \\(Faithful\\)\\. Your old friend is ${told.f[1][0]}: you know for certain that ${told.f[1][1]} is not a Traitor`));
  assert.deepEqual([told.f[0][3], told.f[1][3]], [-99, -99], 'and at a scripted table neither ever points at the other');
  // The player as an Old Friend is shown who.
  const seed2 = await seedFor(page, { size: 8, role: 'friend' }, { me: 'friend' });
  await page.evaluate(o => { Game.App.newGame(Object.assign({ size: 8, mode: 'demo', name: 'Joe', live: false, deck: 'house', rule: 'none', role: 'friend', bet: 'none' }, o)); }, { seed: seed2 });
  const mate = await page.evaluate(() => Game.state.players.find(p => p.role === 'friend' && !p.you));
  assert.match(await page.textContent('dialog'), new RegExp(`Your old friend: ${mate.name}\\.`));
  await page.click('dialog .btn.primary');
  assert.equal(await page.evaluate(id => document.querySelector(`.seat[data-id="${id}"] .seat-tag`).textContent, mate.id), 'Old Friend');
});

s.test('the house rules: a note left by whoever the Traitors murder, a tie between two that banishes both, someone the house vouches for, the lights out on what the night\'s dead were, and a secret ballot', async h => {
  const page = await open(h);
  const firstTown = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town')[0];
  // A note is found.
  await sit(page, { seed: 61, role: 'town', wild: false, rule: 'note', bet: 'none' });
  assert.ok((await sysLines(page)).includes('House rule tonight: A note is found. Whoever the Traitors murder in the night leaves a note: one last line, found in the morning.'));
  await begin(page);
  await page.evaluate(`Game.Bots.kill = ${firstTown.toString()}`);
  await page.click('#mid-go');
  await settle(page);
  let x = await page.evaluate(() => { const g = Game.state; const dead = g.players.find(p => !p.alive); const n = g.log.filter(e => e.kind === 'note'); return { dead: dead.id, first: dead.first, notes: n.map(e => [e.who, e.text]), record: Game.recordText(), shown: document.querySelector('.say[data-kind="note"] .say-words').textContent }; });
  assert.deepEqual([x.notes.length, x.notes[0][0], x.notes[0][1].length > 3], [1, x.dead, true]);
  assert.match(x.record, new RegExp(`^${x.first} \\(a note left behind\\): "`, 'm'), 'the note is in the record every seat is given');
  assert.equal(x.shown, x.notes[0][1]);
  // The player, taken, leaves theirs.
  await sit(page, { seed: 61, role: 'town', wild: false, rule: 'note', bet: 'none' });
  await begin(page);
  await page.evaluate(() => { Game.Bots.kill = () => Game.state.players[0]; });
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.waiting === 'line');
  assert.equal(await page.getAttribute('#say', 'placeholder'), 'The Traitors came for you. Leave a note?');
  await settle(page, { words: 'It is the one who never asks anything.' });
  assert.deepEqual(await page.evaluate(() => Game.state.log.filter(e => e.kind === 'note').map(e => [e.who, e.text])), [['you', 'It is the one who never asks anything.']]);

  // No ties: two tied go, both; three tied, nobody.
  await sit(page, { seed: 61, role: 'town', wild: false, rule: 'both', bet: 'none' });
  await begin(page);
  await page.evaluate(`Game.Bots.kill = ${firstTown.toString()}`);
  await page.click('#mid-go');
  await settle(page);
  // Seven in: the player and three seats on one, the other three on another.
  let pair = await page.evaluate(() => { const live = Game.state.players.filter(p => p.alive && !p.you); const a = live.find(p => p.role === 'town'); const b = live.find(p => p.role === 'knife'); const rest = live.filter(p => p !== a && p !== b);
    Game.Bots.vote = p => ({ vote: p === a ? b : p === b ? a : rest.indexOf(p) < 2 ? a : b, text: 'Them.' }); return { a: a.id, b: b.id, an: a.first, bn: b.first }; });
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${pair.b}"]`);
  await page.click('#mid-go');
  await settle(page);
  // (a: the Traitor's vote and two more = 3; b: the Faithful's vote, two more and the player's = 4. Not a tie: one goes.)
  let g = await st(page);
  assert.deepEqual([g.players.find(p => p.id === pair.a).alive, g.players.find(p => p.id === pair.b).alive], [true, false], 'most votes still goes alone');
  // Now a real tie of two: the player votes with the smaller side.
  if (g.phase === 'night') { await page.evaluate(`Game.Bots.kill = ${firstTown.toString()}`); await page.click('#mid-go'); await settle(page); }
  pair = await page.evaluate(() => { const live = Game.state.players.filter(p => p.alive && !p.you); const a = live[0]; const b = live[1]; const rest = live.slice(2);
    // a and b vote for each other; with an odd number voting, one vote goes elsewhere (on the player); the others go to a and b by turns, and the player evens it.
    const spare = live.length % 2 === 0 ? rest.pop() : null;
    const forA = rest.filter((p, i) => i % 2 === 0);
    Game.Bots.vote = p => ({ vote: p === b ? a : p === a ? b : p === spare ? Game.state.players[0] : forA.includes(p) ? a : b, text: 'Them.' });
    const na = 1 + forA.length; const nb = 1 + rest.length - forA.length; return { a: a.id, b: b.id, an: a.first, bn: b.first, na, nb, vote: na < nb ? a.id : b.id, tie: Math.abs(na - nb) === 1 }; });
  assert.ok(pair.tie, 'the table is set for a tie: ' + JSON.stringify(pair));
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${pair.vote}"]`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  assert.deepEqual([g.players.find(p => p.id === pair.a).alive, g.players.find(p => p.id === pair.b).alive], [false, false], 'a tie between two banishes both');
  const ban = await sysLines(page, 'banish');
  assert.match(ban[ban.length - 2], new RegExp(`^The vote: .+\\. A tie between (${pair.an} and ${pair.bn}|${pair.bn} and ${pair.an}) \\(\\d each\\), and tonight a tie banishes both\\. \\w+ \\w+ is banished with \\d votes\\. \\w+ was `));
  assert.match(ban[ban.length - 1], /^\w+ \w+ is banished with \d votes\. \w+ was /);
  assert.equal(await page.evaluate(() => Game.state.log.filter(e => e.kind === 'last' && e.day === Game.state.log.filter(z => z.kind === 'banish').pop().day).length), 2, 'each has their last words');

  // The house vouches.
  await sit(page, { seed: 61, role: 'town', wild: false, rule: 'vouch', bet: 'none' });
  x = await page.evaluate(() => { const g = Game.state; const v = g.players.find(p => p.id === g.vouched); return { role: v.role, you: !!v.you, id: v.id, name: v.name, first: v.first, lines: g.log.filter(e => e.t === 'sys').map(e => e.text), record: Game.recordText(), sus: g.players.filter(p => !p.you && p.role !== 'knife' && p.id !== v.id).map(p => p.mem.sus[v.id]),
    tag: v.you ? 'Not a Traitor' : document.querySelector(`.seat[data-id="${v.id}"] .seat-tag`).textContent }; });
  assert.notEqual(x.role, 'knife');
  assert.ok(x.lines.includes(x.you ? 'The house vouches for you: you are not a Traitor.' : `The house vouches for ${x.name}: ${x.first} is not a Traitor.`));
  assert.match(x.record, new RegExp(`^The house vouches for ${x.you ? 'Joe' : x.name}: ${x.you ? 'Joe' : x.first} is not a Traitor\\.$`, 'm'));
  assert.ok(x.sus.every(v => v === -99), 'the scripted Faithful never points at them');
  assert.equal(x.tag, 'Not a Traitor');

  // Lights out.
  await sit(page, { seed: 61, role: 'town', wild: false, rule: 'dark', bet: 'none' });
  await begin(page);
  await page.evaluate(`Game.Bots.kill = ${firstTown.toString()}`);
  await page.click('#mid-go');
  await settle(page);
  x = await page.evaluate(() => { const g = Game.state; const d = g.players.find(p => !p.alive); return { name: d.name, first: d.first, out: d.out, death: g.log.filter(e => e.kind === 'death').map(e => e.text), record: Game.recordText(), tag: document.querySelector(`.seat[data-id="${d.id}"] .seat-tag`).textContent, sys: Game.Prompts.system(),
    why: (() => { const live = g.players.filter(p => p.alive && !p.you); return ''; })() }; });
  assert.deepEqual(x.death, [`${x.name} was murdered in the night.`], 'what they were is not said');
  assert.deepEqual([x.out.hidden, x.tag], [true, 'Out']);
  assert.match(x.record, new RegExp(`^Breakfast\\. ${x.name} was murdered in the night\\.$`, 'm'));
  assert.doesNotMatch(x.record, new RegExp(`${x.first} was (Faithful|the|a) `));
  assert.match(x.sys, /The role of anyone banished is shown to all; the role of anyone murdered in the night is not shown until the game is over\./);
  // The vote still shows it, and the end shows everything.
  await page.click('#btn-vote');
  g = await st(page);
  const pickOut = g.players.find(p => p.alive && p.id !== 'you');
  await page.evaluate(id => { Game.Bots.vote = () => ({ vote: Game.state.players.find(p => p.id === id), text: 'Them.' }); const real = Game.Bots.vote; Game.Bots.vote = p => (p.id === id ? { vote: Game.state.players.find(q => q.alive && q !== p), text: 'No.' } : real(p)); }, pickOut.id);
  await page.click(`.seat[data-id="${pickOut.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  assert.match((await sysLines(page, 'banish'))[0], new RegExp(`${pickOut.name} is banished with \\d votes\\. ${pickOut.first} was `));
  assert.equal(await page.evaluate(() => { Game.state.phase = 'over'; Game.UI.render(); return [...document.querySelectorAll('.seat[data-out="1"] .seat-tag')].every(t => t.textContent !== 'Out'); }), true, 'when it is over every card is turned');

  // A secret ballot.
  await sit(page, { seed: 61, role: 'town', wild: false, rule: 'ballot', bet: 'none' });
  await begin(page);
  await page.evaluate(`Game.Bots.kill = ${firstTown.toString()}`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  const target = g.players.find(p => p.alive && p.id !== 'you');
  await page.evaluate(id => { const t = Game.state.players.find(p => p.id === id); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'I am voting for them out loud.' }); }, target.id);
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${target.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  x = await page.evaluate(() => { const g = Game.state; return { votes: g.log.filter(e => e.kind === 'vote').length, ban: g.log.filter(e => e.kind === 'banish').map(e => e.text), priv: g.log.filter(e => e.priv).map(e => e.text), log: g.votesLog[0], last: g.lastVotes, record: Game.recordText(),
    carry: g.players.filter(p => p.alive && !p.you).map(p => Game.Prompts.carrying(p).join(' ')).join(' | ') }; });
  assert.equal(x.votes, 0, 'nobody says who they voted for');
  assert.match(x.ban[0], new RegExp(`^The vote: ${target.first} 6, \\w+ 1 \\(a secret ballot\\)\\. ${target.name} is banished with 6 votes\\.`));
  assert.ok(x.priv.includes(`You voted for ${target.first}. Nobody saw.`));
  assert.deepEqual([x.log.secret, Object.keys(x.log.votes).length, x.last], [true, 7, {}]);
  assert.doesNotMatch(x.record, /voted \w+;|out loud/, 'and the record has the count only');
  assert.doesNotMatch(x.carry, /voted to banish you|so did/, 'no seat is told who voted for whom');
  assert.match(x.carry, /Yesterday you voted for /, 'only how its own vote turned out');
});

s.test('a side bet to play for, a tab the house keeps from night to night, the people sat with remembering the last time, and Deal again', async h => {
  const page = await open(h);
  // The bets read the game as it went.
  const bets = await page.evaluate(() => {
    const by = id => Game.BETS.find(b => b.id === id);
    const K = { role: 'knife' }; const T = { role: 'town' };
    return [by('sharp').won({ mine: [{ p: K, went: true, day: 1 }, { p: K, went: false, day: 2 }] }), by('sharp').won({ mine: [{ p: K }, { p: T }] }), by('sharp').won({ mine: [] }),
      by('early').won({ mine: [{ p: K, went: true, day: 1 }] }), by('early').won({ mine: [{ p: K, went: true, day: 2 }] }),
      by('herd').won({ mine: [{ p: T, went: true }, { p: K, went: true }] }), by('frame').won({ mine: [{ p: T, went: true }, { p: K, went: true }] }),
      by('unmarked').won({ votes: [{ votes: { you: 'a', a: 'b' } }] }), by('unmarked').won({ votes: [{ votes: { you: 'a', a: 'you' } }] }),
      by('marks').won({ players: [{ role: 'knife', mark: 'sus' }, { role: 'town', alive: true, mark: 'trust' }, { role: 'town', alive: false, mark: 'sus' }] }), by('marks').won({ players: [{ role: 'knife', mark: 'sus' }, { role: 'town', alive: true, mark: 'sus' }] }),
      Game.BETS.filter(b => b.for('town')).map(b => b.id), Game.BETS.filter(b => b.for('knife')).map(b => b.id), Game.BETS.filter(b => b.for('fool')).map(b => b.id)];
  });
  assert.deepEqual(bets, [true, false, false, true, false, true, false, true, false, true, false, ['standing', 'unmarked', 'herd', 'sharp', 'early', 'marks'], ['standing', 'unmarked', 'herd', 'hands', 'frame'], ['quick']]);
  // A night, played out.
  await sit(page, { seed: 21, role: 'town', bet: 'standing' });
  assert.equal(await page.evaluate(() => Game.state.bet), 'standing');
  const end = await playOut(page);
  const after = await page.evaluate(() => ({ l: Game.Ledger.read(), bet: Game.state.betWon, tab: Game.state.tab, won: document.querySelector('#mid .mid-k').textContent === 'You won', again: document.querySelector('#mid-go').textContent }));
  assert.equal(after.bet, end.me.alive, 'still in their seat or not');
  assert.deepEqual([after.l.nights, after.l.won, after.l.streak, after.l.roles.town, after.l.bets.standing || 0], [1, after.won ? 1 : 0, after.won ? 1 : 0, { n: 1, won: after.won ? 1 : 0 }, end.me.alive ? 1 : 0]);
  assert.deepEqual(Object.keys(after.l.seats).sort(), end.players.filter(p => p.id !== 'you').map(p => p.id).sort(), 'everyone sat with is in the ledger');
  assert.ok(Object.values(after.l.seats).every(x => x.n === 1 && x.night === 1 && /\{P\}/.test(x.last) && /(The Faithful won|The Traitors won|The Fool won it|won, alone)\./.test(x.last)), JSON.stringify(after.l.seats));
  assert.deepEqual(after.tab, { nights: 1, won: after.l.won, streak: after.l.streak, best: after.l.best });
  assert.equal(after.again, 'Deal again');
  // The reveal says how the night went for the player.
  await page.click('#mid-reveal');
  const top = await page.textContent('dialog .reveal-top');
  assert.match(top, new RegExp(`^You (won|lost)\\. Night 1 on your tab: ${after.l.won} won\\.Side bet ${end.me.alive ? 'won' : 'lost'}: Still be in your seat when it ends\\.$`));
  // It is settled once: looking again does not count the night twice.
  await page.evaluate(() => { document.querySelector('#dlg').close(); Game.UI.reveal(); document.querySelector('#dlg').close(); });
  assert.equal(await page.evaluate(() => Game.Ledger.read().nights), 1);
  // Deal again: the same kind of table, a new night, some of the same people, who are told about the last time on the first day only.
  const before = await page.evaluate(() => ({ seed: Game.state.seed, ids: Game.state.players.map(p => p.id) }));
  await page.click('#mid-go');
  const next = await page.evaluate(() => { const g = Game.state; const back = g.players.filter(p => !p.you && g.history[p.id]); const p = back[0]; const day1 = Game.Prompts.secret(p); g.day = 2; const day2 = Game.Prompts.secret(p); g.day = 1;
    return { phase: g.phase, seed: g.seed, size: g.size, deck: g.deck, live: g.live, mode: g.mode, role: g.players[0].role, back: back.map(q => q.id), hist: g.history[p.id], day1, day2, dialog: document.querySelector('dialog').open,
      plain: Game.Prompts.secret(g.players.find(q => !q.you && !g.history[q.id])) }; });
  assert.deepEqual([next.phase, next.size, next.deck, next.live, next.mode, next.role, next.dialog], ['role', 8, 'classic', false, 'demo', 'town', true]);
  assert.notEqual(next.seed, before.seed);
  assert.equal(next.back.length, 3, 'three of last night\'s table are back, and are the ones who remember');
  assert.ok(next.back.every(id => before.ids.includes(id)));
  assert.match(next.day1, /\nYOU HAVE PLAYED WITH JOE BEFORE \(1 night\)\. The last time: [^{}\n]*\bJoe\b[^{}\n]* You can bring it up, once, the way friends do, if it fits\. The cards are dealt fresh every night, so it tells you nothing about who is what tonight\.$/);
  assert.doesNotMatch(next.day2, /PLAYED WITH/);
  assert.doesNotMatch(next.plain, /PLAYED WITH/, 'a stranger is told nothing');
  // The first screen shows the tab.
  await page.click('dialog .btn.primary');
  await page.click('#btn-quit');
  await page.click('dialog .btn.primary');
  const tab = await page.evaluate(() => ({ hidden: document.querySelector('#home-tab').hidden, line: document.querySelector('#tab-line').textContent, roles: document.querySelector('#tab-roles').textContent, bets: document.querySelector('#tab-bets').textContent, regs: document.querySelector('#tab-regulars').textContent }));
  assert.equal(tab.hidden, false);
  assert.match(tab.line, /^1 night at the table, [01] won$/);
  assert.match(tab.roles, /^Cards held, 1 of 11: Faithful [01]\/1\.$/);
  assert.match(tab.bets, end.me.alive ? /^Side bets won, 1 of 13 kinds: Still be in your seat when it ends\.$/ : /^Side bets won, 0 of 13 kinds\.$/);
  assert.match(tab.regs, /^The regulars: (\w+ \(1\), ){4}\w+ \(1\)\. They remember the last time\.$/);
  // A ledger that cannot be read is a new one, and never stops the page.
  assert.deepEqual(await page.evaluate(() => { localStorage.setItem('novatria.lastcall.ledger', '{"v":1,"nights":"many","seats":7'); const a = Game.Ledger.read(); localStorage.setItem('novatria.lastcall.ledger', JSON.stringify({ v: 1, nights: -4, won: 'x', seats: [1] })); const b = Game.Ledger.read(); Game.UI.home(); return [a.nights, b.nights, b.won, b.seats]; }), [0, 0, 0, {}]);
});

s.test('with Claude at a house table: the rules every seat is given name tonight\'s cards and the house rule, the note the dead leave is a call of its own, and the first screen deals a house table by default', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.evaluate(() => sessionStorage.setItem('novatria.apiKey', 'sk-ant-test-key'));
  const seed = await seedFor(page, { size: 10, role: 'knife' }, { me: 'knife', has: ['drunk', 'friend', 'listener'] });
  await sit(page, { seed, size: 10, mode: 'claude', deck: 'house', rule: 'note', role: 'knife', bet: 'none' });
  assert.match((await sysLines(page))[0], /^Last call was hours ago\. 10 of you round one table, the doors shut\. In tonight's deck: 3 Traitors, a Witness, a Listener, two Old Friends, a Drunk, the rest Faithful\.$/);
  await begin(page);
  const prey = await page.evaluate(() => Game.state.players.find(p => p.alive && p.role === 'town'));
  await page.click(`.seat[data-id="${prey.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const note = bodies.find(b => /By the house rule you leave a note/.test(userOf(b)));
  assert.ok(note, 'the one taken is asked for their note');
  assert.match(userOf(note), new RegExp(`YOUR SEAT: ${prey.name}\\.`));
  assert.deepEqual(await page.evaluate(() => Game.state.log.filter(e => e.kind === 'note').map(e => e.text.toLowerCase())), ['you will all be sorry by morning']);
  await page.fill('#say', 'Well. Who was it?');
  await page.click('#btn-say');
  await settle(page);
  const talk = bodies.filter(b => b.body.output_config.format.schema.required.includes('stance'));
  assert.ok(talk.length >= 2);
  const sys = talk[0].body.system[0].text;
  assert.match(sys, /One of the Faithful is the Witness\.\n/, 'no Watch tonight, so none in the rules');
  assert.doesNotMatch(sys, /the Watch|the Fool|the Hothead|the Bouncer|the Turncoat/);
  assert.match(sys, /^- One of the Faithful is the Listener, .*Round the table, in order: Joe, /m);
  assert.match(sys, /^- Two of the Faithful are Old Friends/m);
  assert.match(sys, /^- One of the Faithful is the Drunk, who has been told they are the Witness and is not/m);
  assert.match(sys, /^- The house rule tonight, "A note is found": Whoever the Traitors murder in the night leaves a note: one last line, found in the morning\.$/m);
  assert.match(userOf(talk[0]), new RegExp(`^${prey.first} \\(a note left behind\\): "`, 'm'), 'and the note is in the record');
  assert.ok(talk.every(b => !/YOUR SECRET ROLE: Drunk/.test(userOf(b))), 'nobody is told they are the Drunk');
  // The first screen: the house deals unless told otherwise.
  await page.click('#btn-quit');
  await page.click('dialog .btn.primary');
  await page.click('#f-mode [data-v="demo"]');
  await page.click('#f-deck [data-v="house"]');
  assert.match(await page.textContent('#deck-help'), /^A different table every night/);
  await page.click('#btn-new');
  const g = await page.evaluate(() => ({ deck: Game.state.deck, rule: Game.state.rule, bet: Game.state.bet, cards: Object.values(Game.state.cards).reduce((a, b) => a + b, 0), text: document.querySelector('dialog').textContent }));
  assert.deepEqual([g.deck, g.cards, !!g.rule, !!g.bet], ['house', 3, true, true]);
  assert.match(g.text, /House rule: [A-Z][^.]+\. /);
  assert.match(g.text, /Your side bet: /);
  // The Roles list has tonight's deck, each card in a line, and the house rule.
  await page.click('dialog .btn.primary');
  await page.click('#btn-roles');
  const roles = await page.evaluate(() => ({ cards: [...document.querySelectorAll('dialog .deck li')].map(li => li.dataset.card), n: Object.keys(Game.state.cards).length, text: document.querySelector('dialog').textContent }));
  assert.equal(roles.cards.length, roles.n);
  assert.match(roles.text, /Tonight's deck2 Traitors, a Witness, .*the rest Faithful\./);
  assert.match(roles.text, /House rule: /);
});

/* ----- The bank (the owner: "What if, we have different personalities bank,
   like let's say 50, and the game randomly chooses 8 for my game or however
   much i have"). Fifty people, each the same person every night they sit
   down, and a table drawn from them. ----- */
s.test('the bank: fifty people, each with a way of playing, of typing and of talking that is theirs every night; a table is drawn from them at random, no two at it type alike, and the player is shown what each is like', async h => {
  const page = await open(h);
  const bank = await page.evaluate(() => {
    const P = Game.PERSONAS; const ids = Object.keys(P); const R = Game.Rules;
    for (const c of Game.CAST) Game.faceNode(c);
    const types = Game.TYPES.map(t => t.id);
    const res = { n: ids.length, cast: Game.CAST.length, same: Game.CAST.every(c => !!P[c.id]), firsts: new Set(Game.CAST.map(c => c.name.split(' ')[0])).size, tags: new Set(ids.map(i => P[i].tag)).size, plays: new Set(ids.map(i => P[i].play)).size,
      bad: ids.filter(i => { const w = P[i]; return !(w.tag.length >= 4 && w.tag.length <= 32 && /\b[Yy]ou\b/.test(w.play) && /\.$/.test(w.play) && w.play.length <= 220 && types.includes(w.type) && types.includes(w.type2) && w.type !== w.type2 && w.chat >= 0.4 && w.chat <= 1.7 && w.shield > 0 && w.shield < 1 && w.join > 0 && w.join < 1); }),
      chat: [Math.min(...ids.map(i => P[i].chat)), Math.max(...ids.map(i => P[i].chat))], all: ids.map(i => P[i].play).join(' '), young: Game.CAST.filter(c => !(c.age >= 21)).length };
    // Drawn at random: over many nights everyone gets a seat, and two nights rarely have the same table.
    const seen = new Set(); const tables = new Set(); let alike = 0; let moved = 0; let other = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = R.deal({ seed, size: 8, deck: 'faithful' });
      const seats = g.players.filter(p => !p.you);
      seats.forEach(p => seen.add(p.id));
      tables.add(seats.map(p => p.id).sort().join());
      if (new Set(seats.map(p => p.type)).size !== 7) alike += 1;
      // (Their own habit, or their second when it was taken; rarely a third.)
      moved += seats.filter(p => p.type !== P[p.id].type).length;
      other += seats.filter(p => p.type !== P[p.id].type && p.type !== P[p.id].type2).length;
      if (!seats.every(p => p.chat === P[p.id].chat)) alike += 100;
    }
    res.seen = seen.size; res.tables = tables.size; res.alike = alike; res.kept = 1 - moved / (300 * 7); res.own = 1 - other / (300 * 7);
    res.sizes = [6, 8, 10].map(size => R.deal({ seed: 4, size, deck: 'faithful' }).players.length - 1);
    return res;
  });
  assert.deepEqual([bank.n, bank.cast, bank.same, bank.firsts, bank.tags, bank.plays, bank.young], [50, 50, true, 50, 50, 50, 0], 'fifty people, no two alike, and nobody without a face or a name of their own');
  assert.deepEqual(bank.bad, []);
  assert.ok(bank.chat[1] >= 4 * bank.chat[0], 'some never shut up and some lurk');
  assert.doesNotMatch(bank.all, /often wrong|get details wrong|do not care|without a reason|whatever happens|probably right|always|never speak/i, 'nobody\'s way of playing is a way of playing badly, or a script');
  assert.deepEqual([bank.seen, bank.alike, bank.sizes], [50, 0, [5, 7, 9]], 'everyone gets a seat sooner or later; no two at a table type alike');
  assert.ok(bank.tables >= 295, 'and hardly any two nights have the same table: ' + bank.tables);
  assert.ok(bank.kept >= 0.6 && bank.own >= 0.85, 'a person types in their own habit, or their second when someone at the table has the first: ' + bank.kept.toFixed(2) + ', ' + bank.own.toFixed(2));
  // The same person at two different tables is the same person: told the same way of playing, and shown the same to the player.
  const who = await page.evaluate(() => { const R = Game.Rules; const a = R.deal({ seed: 3, size: 8, deck: 'faithful' }).players.filter(p => !p.you).map(p => p.id); for (let seed = 4; seed < 400; seed++) { const b = R.deal({ seed, size: 8, deck: 'faithful' }).players.filter(p => !p.you).map(p => p.id); const both = a.find(id => b.includes(id)); if (both) return { id: both, seed }; } return null; });
  const at = async seed => {
    await sit(page, { seed, deck: 'faithful', role: 'town' });
    await begin(page);
    await page.click(`.seat[data-id="${who.id}"]`);
    return page.evaluate(id => { const p = Game.state.players.find(q => q.id === id); return { sheet: document.querySelector('#sheet .sheet-role').textContent, way: /^YOUR TEMPERAMENT: (.+)$/m.exec(Game.Prompts.secret(p))[1], tag: Game.PERSONAS[id].tag, play: Game.PERSONAS[id].play, sys: Game.Prompts.system() }; }, who.id);
  };
  const one = await at(3);
  const two = await at(who.seed);
  assert.equal(one.way, one.play);
  assert.equal(two.way, one.way, 'the same way of playing at both tables');
  assert.match(one.sheet, new RegExp(`^\\d\\d · ${one.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), 'and the player is shown what they are like, on their seat');
  assert.equal(two.sheet, one.sheet);
  assert.ok(!one.sys.includes(one.tag) && !one.sys.includes(one.play), 'the others are told nothing of it: to them a seat is still a name');
});

/* ----- The Traitors' table (the owner, of the house deal: "No make it more
   like traitors with the wordings too"). The words are the show's (Traitors
   and Faithful, murdered, banished, the Round Table, breakfast), and the
   first screen's own table is its game: Traitors and Faithful and nothing
   else, a mission each morning for the pot or the Shield, recruiting when
   a Traitor is banished, and an end game the table has to vote to end. ----- */
s.test('the Traitors\' table: Traitors and Faithful and nothing else (one Traitor at six, two at eight and at ten), no Witness, no wild cards, no house rule; it is the first screen\'s own table, and every seat is given the game in those words', async h => {
  const page = await open(h);
  const out = await page.evaluate(() => {
    const R = Game.Rules; const res = {};
    const count = g => ['knife', 'town'].map(r => g.players.filter(p => p.role === r).length);
    res.counts = [6, 8, 10].map(size => count(R.deal({ seed: 5, size, deck: 'faithful' })));
    const g = R.deal({ seed: 5, size: 8, deck: 'faithful' });
    res.shape = [g.deck, g.format, g.wild, g.cards, g.rule, g.bet, g.pot, g.endgame, g.k0];
    res.asked = ['town', 'knife', 'witness', 'wild', 'fool'].map(role => R.deal({ seed: 9, size: 8, deck: 'faithful', role }).players[0].role);
    res.other = [R.deal({ seed: 5, size: 8 }).format, R.deal({ seed: 5, size: 8, deck: 'house' }).format];
    return res;
  });
  assert.deepEqual(out.counts, [[1, 5], [2, 6], [2, 8]]);
  assert.deepEqual(out.shape, ['faithful', true, false, {}, null, null, 0, false, 2]);
  assert.deepEqual(out.asked.slice(0, 2), ['town', 'knife']);
  assert.ok(out.asked.slice(2).every(r => r === 'town' || r === 'knife'), 'a card the table has not got is not dealt');
  assert.deepEqual(out.other, [false, false], 'the other tables play as they did');
  // The first screen.
  const home = () => page.evaluate(() => ({ deck: document.querySelector('#f-deck [aria-pressed="true"]').dataset.v, help: document.querySelector('#deck-help').textContent, hidden: ['witness', 'wild'].map(v => document.querySelector(`#f-role [data-v="${v}"]`).hidden),
    ten: document.querySelector('#f-size [data-v="10"]').textContent, tag: document.querySelector('.home .tag').textContent, role: document.querySelector('#f-role [aria-pressed="true"]').dataset.v, roles: [...document.querySelectorAll('#f-role button')].filter(b => !b.hidden).map(b => b.textContent) }));
  let hm = await home();
  assert.deepEqual([hm.deck, hm.hidden, hm.ten, hm.roles], ['faithful', [true, true], '10 · two Traitors', ['Deal me in', 'Faithful', 'Traitor']]);
  assert.match(hm.help, /^Traitors and Faithful, and nothing else\./);
  assert.match(hm.tag, /Some of you are Traitors\.$/);
  await page.click('#f-deck [data-v="house"]');
  await page.click('#f-role [data-v="witness"]');
  hm = await home();
  assert.deepEqual([hm.hidden, hm.ten, hm.role], [[false, false], '10 · three Traitors', 'witness']);
  await page.click('#f-deck [data-v="faithful"]');
  assert.equal((await home()).role, 'any', 'a role the Traitors\' table has not got is not left asked for');
  // What the player and the seats are told.
  await page.evaluate(() => { Game.App.speed = 0; Game.App.quiet = true; Game.App.newGame({ seed: 21, size: 8, mode: 'demo', name: 'Joe', live: false, deck: 'faithful', role: 'town' }); });
  const card = await page.textContent('dialog');
  assert.match(card, /Your roleFaithfulYou have no power but your judgement and your vote\./);
  assert.match(card, /8 at the table: 2 Traitors, the rest Faithful\./);
  assert.doesNotMatch(card, /Witness|side bet|House rule/);
  const told = await page.evaluate(() => ({ sys: Game.Prompts.system(), intro: Game.state.log[0].text, mine: Game.Prompts.secret(Game.state.players.find(p => p.role === 'town' && !p.you)), k: Game.Prompts.secret(Game.state.players.find(p => p.role === 'knife')) }));
  assert.equal(told.intro, 'Last call was hours ago. 8 of you round one table, the doors shut, and two Traitors among you. The rest of you are Faithful: banish them at the Round Table before they murder their way to the pot.');
  assert.match(told.sys, /^You are one of 8 friends playing "Last Call", a hidden-role party game of Traitors and Faithful, in the manner of the TV game The Traitors, in the game's group chat\./);
  assert.match(told.sys, /Two of them are secretly Traitors, who know each other\. Everyone else is a Faithful\. Nobody has any power but their judgement and their vote\./);
  for (const re of [/^- Each day starts with a mission: /m, /^- When a Traitor is banished, the Traitors still in may, on a later night, recruit instead of murdering/m, /^- The end game: once four or fewer are left there are no more nights/m, /^- The pot is the prize\./m, /^- The Faithful win at once if every Traitor is banished before the end game\./m]) assert.match(told.sys, re);
  assert.doesNotMatch(told.sys, /Witness|the Watch|at least as many as everyone else/);
  assert.match(told.mine, /YOUR SECRET ROLE: Faithful\. You have no power but your judgement and your vote\./);
  assert.match(told.k, /YOUR SECRET ROLE: Traitor\. Your fellow Traitor: /);
});

s.test('the mission and the Shield: each morning everyone plays for the pot or the Shield, the table is told how many and never who, the pot grows, and whoever holds the Shield cannot be murdered that night, and that night only', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, deck: 'faithful', role: 'town' });
  await begin(page);
  await page.evaluate(() => { Game.Bots.mission = () => 'pot'; Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town')[0]; });
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.waiting === 'pick');
  const ask = await page.evaluate(() => ({ k: document.querySelector('#mid .mid-k').textContent, t: document.querySelector('#mid .mid-t').textContent, b: [...document.querySelectorAll('#mid button')].map(x => x.textContent), table: document.querySelector('#screen-game').dataset.table }));
  assert.deepEqual(ask, { k: 'The mission', t: 'The pot, or the Shield?', b: ['Pot', 'Shield'], table: 'round' });
  await settle(page, { pick: () => 1 });
  let x = await page.evaluate(() => { const g = Game.state; return { pot: g.pot, shield: g.shield, phase: g.phase, sys: g.log.filter(e => e.t === 'sys' && !e.priv).map(e => e.text), priv: g.log.filter(e => e.priv).map(e => e.text), record: Game.recordText(), ready: document.querySelector('#mid-ready').textContent,
    seat: Game.Prompts.secret(g.players.find(p => p.alive && !p.you)), stages: g.log.filter(e => e.kind === 'death').map(e => e.text) }; });
  assert.deepEqual([x.phase, x.pot, x.shield], ['talk', 3000, { id: 'you', night: 2 }], 'seven in: six played for the pot, and the one who played for the Shield has it');
  assert.ok(x.sys.includes('The mission: 6 played for the pot, which stands at $3,000. 1 played for the Shield, and one of them holds it tonight.'));
  assert.ok(x.priv.includes('You won the Shield: the Traitors cannot murder you tonight. Nobody knows you hold it unless you say so.'));
  assert.match(x.record, /^The mission: 6 played for the pot, which stands at \$3,000\./m);
  assert.doesNotMatch(x.record, /You won the Shield/, 'who holds it is not in the record');
  assert.match(x.ready, /^7 still in · pot \$3,000/);
  assert.match(x.seat, /\nTODAY'S MISSION: you played for the pot\.(\n|$)/);
  assert.match(x.stages[0], /^\w+ \w+ was murdered in the night\. \w+ was a Faithful\.$/);
  // Day one: a Faithful is banished. Night two: the Traitors come for the player, who holds the Shield.
  await page.click('#btn-vote');
  const f1 = await page.evaluate(() => { const t = Game.state.players.find(p => p.alive && !p.you && p.role === 'town'); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'Them.' }); Game.Bots.kill = () => Game.state.players[0]; return t.id; });
  await page.click(`.seat[data-id="${f1}"]`);
  await page.click('#mid-go');
  await settle(page);
  assert.match((await sysLines(page, 'banish'))[0], /is banished with 6 votes\. \w+ was a Faithful\.$/);
  await page.click('#mid-go');
  await settle(page);
  x = await page.evaluate(() => { const g = Game.state; const k = g.players.find(p => p.role === 'knife'); const f = g.players.find(p => p.alive && !p.you && p.role === 'town'); return { alive: g.players.filter(p => p.alive).length, me: g.players[0].alive, blocked: g.blocked, pot: g.pot, shield: g.shield,
    sys: g.log.filter(e => e.t === 'sys' && !e.priv && e.day === 2).map(e => e.text), record: Game.recordText(), k: Game.Prompts.secret(k), f: Game.Prompts.secret(f) }; });
  assert.deepEqual([x.alive, x.me, x.blocked], [6, true, { id: 'you', night: 2 }], 'nobody is murdered');
  assert.ok(x.sys.includes('Everyone comes in to breakfast. Nobody was murdered in the night.'), x.sys.join(' | '));
  assert.match(x.record, /^Breakfast\. Everyone is still here: nobody was murdered in the night\.$/m);
  assert.match(x.k, /Last night the Traitors went for Joe, who held the Shield: nobody was murdered\./, 'the Traitors know what stopped them');
  assert.doesNotMatch(x.f, /held the Shield/, 'and nobody else does');
  assert.deepEqual([x.pot, x.shield], [6000, null], 'day two: all six played for the pot');
  assert.ok(x.sys.includes('The mission: 6 played for the pot, which stands at $6,000. Nobody played for the Shield, so nobody holds it tonight.'));
  // The Shield was for that night only: on night three the player is murdered. With four left there is no mission, and the Traitors do not win on numbers.
  await page.click('#btn-vote');
  const f2 = await page.evaluate(() => { const t = Game.state.players.find(p => p.alive && !p.you && p.role === 'town'); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'Them.' }); return t.id; });
  await page.click(`.seat[data-id="${f2}"]`);
  await page.click('#mid-go');
  await settle(page);
  await page.click('#mid-go');
  await settle(page);
  x = await page.evaluate(() => { const g = Game.state; return { phase: g.phase, me: g.players[0].alive, alive: g.players.filter(p => p.alive).map(p => p.role).sort(), pot: g.pot, missions: g.log.filter(e => /^The mission:/.test(e.text || '')).length, death: g.log.filter(e => e.kind === 'death').pop().text }; });
  assert.deepEqual([x.phase, x.me, x.alive, x.pot, x.missions], ['talk', false, ['knife', 'knife', 'town', 'town'], 6000, 2]);
  assert.equal(x.death, 'You were murdered in the night. You were a Faithful.');
});

s.test('recruiting: with a Traitor banished the Traitors left may ask a Faithful to join instead of murdering; a yes makes a Traitor and nobody is murdered, a no to the last Traitor is a murder; and the player can be the one asked', async h => {
  const page = await open(h);
  await sit(page, { seed: 21, size: 10, deck: 'faithful', role: 'knife' });
  await begin(page);
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Tap who the Traitors murder tonight.');
  let g = await st(page);
  const mate = g.players.find(p => p.role === 'knife' && p.id !== 'you');
  await page.click(`.seat[data-id="${g.players.find(p => p.role === 'town').id}"]`);
  assert.match(await page.textContent('#mid-go'), /^Murder \w+$/);
  assert.equal(await page.$('#mid-alt'), null, 'nothing to recruit for yet');
  await page.click('#mid-go');
  await settle(page);
  // Day one: the other Traitor is banished.
  await page.evaluate(id => { const t = Game.state.players.find(p => p.id === id); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'Them.' }); }, mate.id);
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${mate.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  assert.deepEqual([g.phase, g.day, await page.evaluate(() => Game.state.recruit)], ['night', 2, true]);
  assert.match((await sysLines(page, 'banish'))[0], new RegExp(`${mate.name} is banished with 8 votes\\. ${mate.first} was a Traitor\\.$`));
  // Night two: murder, or recruit. A yes.
  assert.equal(await page.evaluate(() => document.querySelector('#mid .mid-t').textContent), 'Tap someone: murder them, or ask them to join you.');
  const pal = g.players.find(p => p.alive && p.role === 'town');
  await page.click(`.seat[data-id="${pal.id}"]`);
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#mid-go').textContent, document.querySelector('#mid-alt').textContent]), ['Murder', 'Recruit']);
  await page.evaluate(() => { Game.Bots.joins = () => true; });
  await page.click('#mid-alt');
  await settle(page);
  let x = await page.evaluate(id => { const g2 = Game.state; const p = g2.players.find(q => q.id === id); return { alive: g2.players.filter(q => q.alive).length, p: [p.role, p.was, p.turned, p.alive], recruit: g2.recruit, priv: g2.log.filter(e => e.priv).map(e => e.text), pub: g2.log.filter(e => e.t === 'sys' && !e.priv && e.day === 2).map(e => e.text), record: Game.recordText(),
    tag: document.querySelector(`.seat[data-id="${id}"] .seat-tag`).textContent, own: Game.Prompts.secret(p) }; }, pal.id);
  assert.deepEqual([x.alive, x.p, x.recruit], [8, ['knife', 'recruit', 2, true], false], 'nobody is murdered, and there is a new Traitor');
  assert.ok(x.priv.includes(`${pal.name} said yes. ${pal.first} is a Traitor now, and with you.`));
  assert.ok(x.pub.includes('Everyone comes in to breakfast. Nobody was murdered in the night.'), 'the table is told only that nobody died');
  assert.doesNotMatch(x.record, /said yes|recruit/i);
  assert.equal(x.tag, 'Traitor');
  assert.match(x.own, /YOUR SECRET ROLE: Traitor\. Your fellow Traitors: Joe and \w+ \w+ \(out\)\.\nYou were a Faithful until night 2, when the Traitors asked you to join them and you said yes\. You are a Traitor now and you win with them\./);
  // Day two: the recruit is banished too. Night three: the last Traitor's ultimatum, refused, is a murder.
  await page.evaluate(id => { const t = Game.state.players.find(p => p.id === id); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'Them.' }); Game.Bots.joins = () => false; }, pal.id);
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${pal.id}"]`);
  await page.click('#mid-go');
  await settle(page);
  assert.match((await sysLines(page, 'banish'))[1], new RegExp(`${pal.first} was a Traitor \\(recruited in the night\\)\\.$`));
  g = await st(page);
  const no = g.players.find(p => p.alive && p.role === 'town');
  await page.click(`.seat[data-id="${no.id}"]`);
  await page.click('#mid-alt');
  await settle(page);
  x = await page.evaluate(id => { const g2 = Game.state; const p = g2.players.find(q => q.id === id); return { p: [p.role, p.alive, p.out && p.out.how], priv: g2.log.filter(e => e.priv).map(e => e.text), death: g2.log.filter(e => e.kind === 'death').pop().text }; }, no.id);
  assert.deepEqual(x.p, ['town', false, 'night']);
  assert.ok(x.priv.includes(`${no.name} refused.`));
  assert.equal(x.death, `${no.name} was murdered in the night. ${no.first} was a Faithful.`);
  // The player, a Faithful, is the one asked: with one Traitor left it is join, or be murdered.
  await sit(page, { seed: 21, size: 10, deck: 'faithful', role: 'town' });
  await begin(page);
  await page.evaluate(() => { Game.Bots.mission = () => 'pot'; Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town')[0]; });
  await page.click('#mid-go');
  await settle(page);
  const t1 = await page.evaluate(() => { const t = Game.state.players.find(p => p.role === 'knife'); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'Them.' }); Game.Bots.recruit = () => Game.state.players[0]; return t.id; });
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${t1}"]`);
  await page.click('#mid-go');
  await settle(page);
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.waiting === 'pick');
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#mid .mid-k').textContent, document.querySelector('#mid .mid-t').textContent, [...document.querySelectorAll('#mid button')].map(b => b.textContent)]), ['In the night', 'Join the Traitors, or be murdered.', ['Join', 'Refuse']]);
  await settle(page);
  x = await page.evaluate(() => { const g2 = Game.state; const me = g2.players[0]; const k = g2.players.find(p => p.role === 'knife' && p.alive && !p.you); return { me: [me.role, me.was, me.turned, me.alive], alive: g2.players.filter(p => p.alive).length, priv: g2.log.filter(e => e.priv).map(e => e.text), bar: document.querySelector('#tb-phase').textContent, tag: document.querySelector(`.seat[data-id="${k.id}"] .seat-tag`).textContent, k: Game.Prompts.secret(k) }; });
  assert.deepEqual([x.me, x.alive], [['knife', 'recruit', 2, true], 8]);
  assert.ok(x.priv.some(t => /^You said yes\. You are a Traitor now, with \w+ \w+, and you win with them\.$/.test(t)), x.priv.join(' | '));
  assert.match(x.bar, /^Traitor · /);
  assert.equal(x.tag, 'Traitor', 'and they are shown who the Traitors are');
  assert.match(x.k, /Joe was recruited on night 2, and is one of you now\./);
});

s.test('the end game: with four left there are no more nights and nothing more is shown; after each vote everyone says end it or banish again, and it ends when all say end, or two are left: one Traitor still in and the Traitors take the pot, none and the Faithful share it', async h => {
  const page = await open(h);
  const toFour = async () => {
    await sit(page, { seed: 21, size: 6, deck: 'faithful', role: 'town' });
    await begin(page);
    await page.evaluate(() => { Game.Bots.mission = () => 'pot'; Game.Bots.kill = () => Game.state.players.filter(p => p.alive && !p.you && p.role === 'town')[0]; });
    await page.click('#mid-go');
    await settle(page);
    // Day one: a Faithful is banished, and four are left.
    const f = await page.evaluate(() => { const t = Game.state.players.find(p => p.alive && !p.you && p.role === 'town'); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'Them.' }); Game.Bots.endVote = () => ({ end: false, text: 'Not yet.' }); return t.id; });
    await page.click('#btn-vote');
    await page.click(`.seat[data-id="${f}"]`);
    await page.click('#mid-go');
    await page.waitForFunction(() => Game.waiting === 'pick');
  };
  const voteOut = async role => {
    const t = await page.evaluate(r => { const x = Game.state.players.find(p => p.alive && !p.you && p.role === r); Game.Bots.vote = p => ({ vote: p === x ? Game.state.players.find(q => q.alive && q !== p && !q.you) || Game.state.players[0] : x, text: 'Them.' }); return { id: x.id, name: x.name, first: x.first }; }, role);
    await page.click('#btn-vote');
    await page.click(`.seat[data-id="${t.id}"]`);
    await page.click('#mid-go');
    return t;
  };
  await toFour();
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#mid .mid-k').textContent, document.querySelector('#mid .mid-t').textContent, [...document.querySelectorAll('#mid button')].map(b => b.textContent), Game.state.endgame, Game.state.pot]), ['The end game', 'End it, or banish again?', ['End it', 'Banish'], true, 2500]);
  await settle(page);
  let x = await page.evaluate(() => { const g = Game.state; return { phase: g.phase, day: g.day, alive: g.players.filter(p => p.alive).length, sys: g.log.filter(e => e.t === 'sys' && !e.priv).map(e => e.text), record: Game.recordText(), k: document.querySelector('#mid .mid-k').textContent, votes: g.log.filter(e => e.kind === 'vote' && /Not yet|End it/.test(e.text)).length }; });
  assert.deepEqual([x.phase, x.day, x.alive, x.k], ['talk', 2, 4, 'Day 2 · the end game'], 'not everyone would end it: the Round Table sits again, with no night between');
  assert.ok(x.sys.includes('The end game. Four of you are left: there are no more nights, and what the banished were is not shown until it is over.'));
  assert.ok(x.sys.some(t => /^The end game\. You vote to end it; \w+, \w+ and \w+ vote to banish again\.$/.test(t)), x.sys.join(' | '));
  assert.match(x.record, /^The end game\. Joe votes to end it; \w+, \w+ and \w+ vote to banish again\.$/m);
  assert.ok(x.sys.includes('The Round Table sits again.'));
  assert.equal(x.votes, 4, 'each says it as they vote');
  // The Traitor is banished, and nobody is told. Then everyone says end: no Traitor is left, and the Faithful share the pot.
  await page.evaluate(() => { Game.Bots.endVote = () => ({ end: true, text: 'End it.' }); });
  const t = await voteOut('knife');
  await settle(page);
  x = await page.evaluate(id => { const g = Game.state; const p = g.players.find(q => q.id === id); return { phase: g.phase, winner: g.winner, hidden: p.out.hidden, ban: g.log.filter(e => e.kind === 'banish').pop().text, end: g.log.filter(e => e.kind === 'end').map(e => e.text), share: g.share, l: Game.Ledger.read(), mid: [document.querySelector('#mid .mid-k').textContent, document.querySelector('#mid .mid-t').textContent],
    tags: [...document.querySelectorAll('.seat .seat-tag')].map(z => z.textContent) }; }, t.id);
  assert.equal(x.ban, `The vote: ${(await page.evaluate(() => Game.state.log.filter(e => e.kind === 'banish').pop().text)).replace(/^The vote: /, '')}`);
  assert.match(x.ban, new RegExp(`${t.name} is banished with 3 votes\\. What ${t.first} was is not shown until the game is over\\.$`));
  assert.deepEqual([x.phase, x.winner, x.hidden], ['over', 'town', true]);
  assert.equal(x.end[0], 'The game is ended, and there is not a Traitor left among you. The Faithful win.');
  assert.match(x.end[1], /^The pot is \$2,500\. You, \w+ and \w+ share it: \$833 each\.$/);
  assert.deepEqual([x.share, x.l.winnings, x.l.nights, x.l.won], [833, 833, 1, 1]);
  assert.deepEqual(x.mid, ['You won', 'The Faithful win']);
  assert.ok(x.tags.every(z => z === 'Faithful' || z === 'Traitor'), 'every card is turned at the end');
  await page.click('#mid-reveal');
  assert.match(await page.textContent('dialog .reveal-top'), /The pot: \$2,500\. Your share: \$833\./);
  await page.click('dialog .btn.primary');
  await page.click('#btn-quit');
  assert.match(await page.textContent('#tab-line'), /^1 night at the table, 1 won · \$833 from the pot$/);
  // The other way: a Faithful is banished instead, unseen, and at three the table sits again; then two are left, and it is over with the Traitor still in.
  await toFour();
  await settle(page);
  const f2 = await voteOut('town');
  await page.waitForFunction(() => Game.waiting === 'pick');
  assert.equal(await page.evaluate(id => document.querySelector(`.seat[data-id="${id}"] .seat-tag`).textContent, f2.id), 'Out', 'what the banished were is not shown in the end game');
  assert.doesNotMatch(await page.evaluate(() => Game.recordText()), new RegExp(`${f2.first} was a Faithful`));
  await page.evaluate(() => { Game.Bots.endVote = () => ({ end: false, text: 'Not yet.' }); });
  await settle(page, { pick: () => 1 });
  assert.deepEqual(await page.evaluate(() => [Game.state.phase, Game.state.players.filter(p => p.alive).length]), ['talk', 3]);
  const f3 = await voteOut('town');
  await settle(page);
  x = await page.evaluate(() => { const g = Game.state; const k = g.players.find(p => p.role === 'knife'); return { phase: g.phase, winner: g.winner, alive: g.players.filter(p => p.alive).map(p => p.id), k: [k.name, k.first], end: g.log.filter(e => e.kind === 'end').map(e => e.text), share: g.share, mid: document.querySelector('#mid .mid-k').textContent, picks: g.log.filter(e => /^The end game\./.test(e.text || '')).length }; });
  assert.deepEqual([x.phase, x.winner, x.alive.length, x.share, x.mid], ['over', 'knives', 2, 0, 'You lost'], 'two left: it ends without a vote');
  assert.equal(x.end[0], `The game is ended, and ${x.k[0]} was a Traitor all along. The Traitors win.`);
  assert.equal(x.end[1], `The pot is $2,500, and ${x.k[1]} takes all of it.`);
  assert.ok(f3.id && x.picks === 3, 'the end game was opened once and voted on twice');
});

s.test('with Claude at the Traitors\' table: every seat is given the game in its words and what it did at the mission, and the end game\'s vote is a call of its own', async h => {
  const bodies = [];
  const page = await open(h, { route: standIn(bodies) });
  await page.evaluate(() => sessionStorage.setItem('novatria.apiKey', 'sk-ant-test-key'));
  // (The stand-in has the Traitors murder the player on the first night, and the table banish the first seat: a Faithful, at this seed.)
  const seed = await seedFor(page, { size: 6, deck: 'faithful', role: 'town' }, { me: 'town', seat1: 'town' });
  await sit(page, { seed, size: 6, mode: 'claude', deck: 'faithful', role: 'town' });
  await begin(page);
  await page.click('#mid-go');
  await settle(page);
  let g = await st(page);
  assert.deepEqual([g.phase, g.me.alive, g.players.filter(p => p.alive).length], ['talk', false, 5]);
  await pass(page);
  const userOf = b => b.body.messages[0].content.map(c => c.text).join('\n');
  const talk = bodies.filter(b => b.body.output_config.format.schema.required.includes('stance'));
  assert.ok(talk.length >= 2);
  const sys = talk[0].body.system[0].text;
  assert.match(sys, /a hidden-role party game of Traitors and Faithful, in the manner of the TV game The Traitors/);
  assert.match(sys, /^- Each day starts with a mission: /m);
  assert.match(sys, /^- The end game: once four or fewer are left/m);
  assert.doesNotMatch(sys, /Witness|Knife|Knives|\bTown\b/);
  assert.ok(talk.every(b => /\nTODAY'S MISSION: you played for the (pot|Shield)\./.test(userOf(b))), 'each seat knows what it played for');
  assert.match(userOf(talk[0]), /^The mission: \d played for the pot, which stands at \$[\d,]+\. /m);
  assert.match(userOf(talk[0]), /^Breakfast\. Joe \w* ?was murdered in the night\. Joe was a Faithful\.$/m);
  // The vote leaves four: the end game, a call for each of them.
  await page.click('#btn-vote');
  await page.click('#mid-go');
  await settle(page);
  g = await st(page);
  const ends = bodies.filter(b => b.body.output_config.format.schema.required.includes('end'));
  assert.equal(ends.length, 4);
  assert.match(userOf(ends[0]), /NOW: the end game\. 4 of you are left: \w+, \w+, \w+, \w+\. Everyone votes at once: END THE GAME, or BANISH AGAIN\./);
  assert.deepEqual([g.phase, await page.evaluate(() => Game.state.endgame), await page.evaluate(() => Game.state.usage.failed)], ['talk', true, 0], 'they said banish again, so the Round Table sits again');
  assert.ok((await sysLines(page)).some(t => /^The end game\. Nobody votes to end it; \w+, \w+, \w+ and \w+ vote to banish again\.$/.test(t)));
});

s.test('on a small phone the Traitors\' table fits: the mission\'s two answers, a Traitor\'s murder or recruit, and the end game\'s vote', async h => {
  const vp = { width: 320, height: 568 };
  const page = await open(h, { viewport: vp });
  const okMid = () => page.evaluate(() => [...document.querySelectorAll('#mid button')].every(b => { const r = b.getBoundingClientRect(); return r.height >= 43.5 && r.left >= 0 && r.right <= window.innerWidth && r.bottom <= document.querySelector('.table-area').getBoundingClientRect().bottom + 1; }));
  assert.deepEqual(await overflowReport(page, vp.width), [], 'the first screen');
  await sit(page, { seed: 21, size: 6, deck: 'faithful', role: 'knife' });
  await begin(page);
  await page.evaluate(() => { Game.state.recruit = true; Game.UI.render(); });
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.state.players.find(p => !p.you).id)}"]`);
  assert.equal(await page.textContent('#mid-alt'), 'Recruit');
  assert.ok(await okMid(), 'murder or recruit');
  assert.deepEqual(await overflowReport(page, vp.width), []);
  await page.evaluate(() => { Game.state.recruit = false; });
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.waiting === 'pick');
  assert.ok(await okMid(), 'the mission');
  assert.deepEqual(await overflowReport(page, vp.width), []);
  await settle(page);
  assert.deepEqual(await overflowReport(page, vp.width), [], 'the talk, with the pot in the line under the faces');
  await page.evaluate(() => { const t = Game.state.players.find(p => p.alive && !p.you); Game.Bots.vote = p => ({ vote: p === t ? Game.state.players.find(q => q.alive && q !== p && !q.you) : t, text: 'Them.' }); Game.tmp = t.id; });
  await page.click('#btn-vote');
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.tmp)}"]`);
  await page.click('#mid-go');
  await page.waitForFunction(() => Game.waiting === 'pick');
  assert.equal(await page.textContent('#mid .mid-k'), 'The end game');
  assert.ok(await okMid(), 'end it, or banish again');
  assert.deepEqual(await overflowReport(page, vp.width), []);
});

s.test('on a small phone the house deal fits: the tab on the first screen, the role card with the deck, the rule and the bet, the list of tonight\'s cards, the Bouncer\'s two choices and the reveal', async h => {
  const vp = { width: 320, height: 568 };
  const page = await open(h, { viewport: vp });
  const fits = () => page.evaluate(() => { const d = document.querySelector('dialog[open]'); const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight + 1 && [...d.querySelectorAll('button')].every(b => b.getBoundingClientRect().height >= 43.5 && b.getBoundingClientRect().bottom <= window.innerHeight + 1); });
  // A ledger with a few nights in it, and the longest lines it can have.
  await page.evaluate(() => {
    const l = Game.Ledger.blank(); l.nights = 124; l.won = 61; l.streak = 12; l.best = 14;
    for (const r of Object.keys(Game.Rules.ROLE)) l.roles[r] = { n: 11, won: 5 };
    for (const b of Game.BETS) l.bets[b.id] = 3;
    Game.CAST.slice(0, 9).forEach((c, i) => { l.seats[c.id] = { n: 30 - i, night: 100 + i, last: 'Neither you nor {P} was a Traitor. The Faithful won.' }; });
    Game.Ledger.write(l); Game.UI.home();
  });
  assert.equal(await page.evaluate(() => document.querySelector('#home-tab').hidden), false);
  assert.match(await page.textContent('#tab-line'), /^124 nights at the table, 61 won · 12 in a row · best run 14$/);
  assert.deepEqual(await overflowReport(page, vp.width), [], 'the first screen with a full tab');
  const seed = await seedFor(page, { size: 10 }, { me: 'bouncer', has: ['friend', 'turncoat'] });
  await page.evaluate(o => { Game.App.speed = 0; Game.App.newGame(Object.assign({ size: 10, mode: 'demo', name: 'Joe', live: false, deck: 'house', rule: 'ballot', bet: 'thrown' }, o)); }, { seed });
  assert.ok(await fits(), 'the role card');
  assert.deepEqual(await overflowReport(page, vp.width), []);
  await page.click('dialog .btn.primary');
  await page.click('#btn-roles');
  assert.ok(await fits(), 'the Roles list, with tonight\'s cards under it');
  assert.equal(await page.evaluate(() => { const sc = document.querySelector('dialog .scroll'); return sc.scrollHeight > sc.clientHeight && getComputedStyle(sc).overflowY === 'auto'; }), true, 'it scrolls in itself');
  await page.click('dialog .btn.primary');
  await begin(page);
  assert.deepEqual(await overflowReport(page, vp.width), [], 'the Bouncer\'s night');
  const mid = await page.evaluate(() => { const b = document.querySelector('#mid-go').getBoundingClientRect(); return [document.querySelector('#mid-go').textContent, b.height >= 43.5, b.left >= 0 && b.right <= window.innerWidth]; });
  assert.deepEqual(mid, ['Not tonight', true, true]);
  await page.click(`.seat[data-id="${await page.evaluate(() => Game.state.players.find(p => p.alive && !p.you).id)}"]`);
  assert.deepEqual(await overflowReport(page, vp.width), [], 'someone picked to throw out');
  await page.evaluate(() => { Game.App.quiet = false; Game.state.players[0].alive = false; Game.state.players[0].out = { how: 'night', day: 1 }; Game.UI.sel = null; Game.UI.render(); });
  await page.click('#btn-skip');
  await settle(page);
  await page.waitForSelector('dialog[open] .reveal-top');
  assert.ok(await fits(), 'the reveal, with how the night went above the roles');
  assert.deepEqual(await overflowReport(page, vp.width), []);
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
});

s.run();
