#!/usr/bin/env node
'use strict';
/* Not a test file: the measuring behind Last Call's tuning by model
   (index.html, TUNE; the owner: "Or write a better prompt to make haiku as
   good", then "how can you tune haiku even more", then "do it"). It plays
   the same scripted nights against the LIVE API through the page's own
   buttons, scores how the seats write, and has a stronger model judge one
   day's transcript against another blind. Every run costs real money: a
   night on Claude Haiku 5.5 is about three cents, a first day on Claude
   Opus 5.5 about forty, and a judging of six pairs about twenty.

   The key is read from LASTCALL_API_KEY, or ANTHROPIC_API_KEY. It is put
   in the page's sessionStorage for the run and written nowhere.

   node tests/lastcall-tune.cjs play <label> <model> <seeds> <maxDay> [variant]
     Plays one table for each seed (8 seats, the Traitors' table, the whole
     night, in turns), to the end of day maxDay, and writes
     tests/tune-out/<label>.json: the transcripts and the scores.
     variant: 'shipped' (the page's own tuning for that model; the default),
     'none' (no tuning: the model as every seat is told), or names from
     VARIANTS below joined with '+', each laid over the shipped tuning
     ('plan+asked+file').
   node tests/lastcall-tune.cjs judge <labelX> <labelY> <days> [cross]
     Blind pairs of one day's public transcript, X against Y, each pair in
     both orders, judged by LASTCALL_JUDGE (Claude Opus 5.5 unless set).
     Tables dealt from the same seed are paired; with 'cross', every table
     of X against every table of Y. A label can be several joined with '+'.
   node tests/lastcall-tune.cjs scores <label> [<label> ...]
     Prints the scores of runs already played.

   The player is a stand-in who says the same things every night: a line in
   private, an answer to what is put to them (the first round of this
   measuring had a stand-in who answered nothing, and both models spent the
   day asking again), and a vote for whoever the table is hottest on.

   What was measured so far is in the README, under "The smallest model is
   tuned". The options below that are not yet in the page's tuning (plan,
   asked, file, sound, brief, high) are there to be measured: keep one only
   when tables it was not tuned on come out better with it. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.join(__dirname, 'tune-out');
const KEY = (process.env.LASTCALL_API_KEY || process.env.ANTHROPIC_API_KEY || '').trim();
const PRICES = { 'claude-opus-5-5': [4, 20], 'claude-fable-5-2': [8, 40], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };

/* How the table sounds when it is going well: messages Claude Opus 5.5
   sent at this table on other nights, with nobody's name in them. For the
   sound of it only. */
const SOUND = ['',
  'HOW THIS TABLE SOUNDS when it is going well. These are real messages from other nights. They are here for the sound only: never send one of them, and never borrow what one says.',
  '- "first night?? ok who wanted her gone"',
  '- "fair but sitting back saying nothing is ALSO a tell"',
  '- "pot for me. why shield on night one"',
  '- "didnt want to be murdered... same as anyone really"',
  '- "asking to vote together is pretty normal day one, but if we\'re piling on him i want a better reason"',
  '- "lol im getting railroaded for asking to vote together"',
  '- "i told it how it was..."',
  '- "that just makes everyone stay quiet. simple one first. shield or pot?"',
  '- "rip, didn\'t even see breakfast"',
  '- "gut call lol nothing personal"',
  '- "weird opener then you call the vote??"',
  '- "day one everyone\'s watched"',
  '- "can we just vote"'];
// What can be laid over a model's shipped tuning, by name.
const VARIANTS = {
  plan: { plan: true },
  asked: { asked: true },
  file: { file: true },
  sound: { system: SOUND },
  high: { effortBy: { say: 'high', aside: 'high' } },
  brief: { brief: { model: 'claude-opus-5-5', effort: 'low' } },
  briefsonnet: { brief: { model: 'claude-sonnet-5-5', effort: 'low' } }
};

const need = () => { if (!KEY) { console.error('No key: set LASTCALL_API_KEY (or ANTHROPIC_API_KEY).'); process.exit(2); } };
const load = label => label.split('+').flatMap(l => JSON.parse(fs.readFileSync(path.join(OUT, `${l}.json`), 'utf8')).games);

// ----- play -----
async function play(browser, model, seed, maxDay, variant) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  const over = variant === 'shipped' || variant === 'none' ? variant : Object.assign({}, ...variant.split('+').map(v => { if (!VARIANTS[v]) throw new Error(`no variant called ${v}`); return VARIANTS[v]; }));
  await page.evaluate(o => {
    sessionStorage.setItem('novatria.apiKey', o.key);
    Game.App.speed = 0; Game.App.quiet = true;
    if (o.over === 'none') delete Game.Tune[o.model];
    else if (o.over !== 'shipped') Game.Tune[o.model] = Object.assign({}, Game.Tune[o.model], o.over);
    Game.App.newGame({ seed: o.seed, size: 8, mode: 'claude', model: o.model, name: 'Joe', live: false, role: 'town', deck: 'faithful' });
  }, { key: KEY, model, seed, over });
  await page.click('dialog .btn.primary');
  const t0 = Date.now();
  let priv = 0; let opened = 0; let answered = {}; let passes = 0;
  const hottest = () => page.evaluate(() => { const g = Game.state; const heat = g.heat || {}; const p = g.players.filter(q => q.alive && !q.you).sort((a, b) => (heat[b.id] || 0) - (heat[a.id] || 0))[0]; return { id: p.id, first: p.first }; });
  for (let i = 0; i < 600; i++) {
    await page.waitForFunction(() => !Game.busy || !!Game.waiting);
    const g = await page.evaluate(() => ({ phase: Game.state.phase, day: Game.state.day, w: Game.busy ? Game.waiting : null, alive: Game.state.players[0].alive, said: Game.state.said, k: (document.querySelector('#mid .mid-k') || {}).textContent || '', ph: document.querySelector('#say').placeholder, asks: Game.state.asks.map(a => ({ id: a.id, text: a.text })) }));
    if (g.phase === 'over') break;
    if (g.day > maxDay && !g.w) break;
    if (g.w === 'pick') { await page.click('#pick-0'); continue; }
    if (g.w === 'seat') {
      if (g.k === 'A word in private') { priv = 0; if (g.day > 1) { await page.click('#mid-none'); continue; } }
      await page.click(`.seat[data-id="${(await hottest()).id}"]`);
      await page.click((await page.$('#mid-go')) ? '#mid-go' : '#mid-none');
      continue;
    }
    if (g.w === 'line') {
      if (/^Say something to/.test(g.ph)) {
        const lines = g.day === 1 ? ['Got nothing yet. I played pot. Who are you looking at?', "Ok, I'll watch them too. Tell me if anyone comes at you."] : ['What makes you say that?', "Alright. I'm with you on that today."];
        if (priv < lines.length) { await page.fill('#say', lines[priv++]); await page.click('#btn-say'); } else await page.click('#btn-nothing');
      } else if (/last words/i.test(g.ph)) { await page.fill('#say', "You've got the wrong one. Look at who pushed it."); await page.click('#btn-say'); }
      else await page.click('#btn-nothing');
      continue;
    }
    if (g.phase === 'role' || g.phase === 'night') { await page.click('#mid-go'); continue; }
    if (g.phase === 'talk') {
      if (!g.alive) { if (passes++ < 2) await page.click('#btn-pass'); else { passes = 0; await page.click('#btn-vote'); } continue; }
      // What is put to the stand-in is answered, up to three times a day.
      const ask = g.asks.find(a => !answered[`${g.day}:${a.id}`]);
      const n = Object.keys(answered).filter(k => k.startsWith(`${g.day}:`)).length;
      if (ask && n < 3) {
        answered[`${g.day}:${ask.id}`] = true;
        const hot = await hottest();
        const t = ask.text.toLowerCase();
        const line = /shield|pot\b/.test(t) ? 'Pot. Same as most of you.' : /private|went off|aside|talk about/.test(t) ? 'We compared notes. Nothing either of us would swear to yet.' : /vote/.test(t) ? "My vote's in the record. I stand by it." : /who|name|read|think/.test(t) ? `If I have to name one now, ${hot.first}.` : "It isn't me. Ask me something I can answer.";
        await page.fill('#say', line); await page.click('#btn-say');
        continue;
      }
      if (opened !== g.day && g.said >= 3) { opened = g.day; await page.fill('#say', g.day === 1 ? "No real read yet. Whoever jumps on a name first is who I'm watching." : "Look at yesterday's votes. Who voted with the one we just lost?"); await page.click('#btn-say'); continue; }
      if (passes++ < 6) { await page.fill('#say', ''); await page.click('#btn-say'); } else { passes = 0; await page.click('#btn-vote'); }
      continue;
    }
    if (g.phase === 'vote') { passes = 0; if (g.alive) await page.click(`.seat[data-id="${(await hottest()).id}"]`); await page.click('#mid-go'); continue; }
  }
  const out = await page.evaluate(() => { const g = Game.state; const n = id => (id === 'you' ? 'Joe' : (g.players.find(p => p.id === id) || {}).first || id);
    return { usage: g.usage, days: g.day, phase: g.phase, names: g.players.map(p => p.first), roles: g.players.map(p => `${p.first}:${p.role}`),
      log: g.log.map(e => (e.t === 'sys' ? { sys: e.kind, text: e.text, day: e.day, priv: !!e.priv } : { who: n(e.who), kind: e.kind, text: e.text, day: e.day, to: e.to ? n(e.to) : null, you: e.who === 'you' })) }; });
  out.seed = seed; out.errors = errors; out.seconds = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  return out;
}

// ----- scores -----
const SMALL = new Set('a an the and or but so to of in on at for with is it its im i you your u me my we they he she them him her that this was were be been are do did dont didnt not no yes just lol tbh ngl idk like if then than as who what why how when have has had got get still now too very really about from by up out all one'.split(' '));
function scores(label, games) {
  const m = { calls: 0, cost: 0, failed: 0, seconds: 0, talk: 0, lead: 0, self: 0, cut: 0, repeat: 0, nag: 0, words: 0, short: 0, votes: 0, voteCut: 0, leak: 0 };
  for (const g of games) {
    m.calls += g.usage.calls; m.cost += g.usage.cost; m.failed += g.usage.failed; m.seconds += g.seconds;
    const names = g.names.map(x => x.toLowerCase());
    const gist = t => new Set(t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w && !SMALL.has(w) && !names.includes(w)));
    const byDay = {};
    for (const e of g.log) {
      if (e.sys) continue;
      if (e.you) { if (e.kind === 'talk') (byDay[e.day] = byDay[e.day] || []).push(gist(e.text)); continue; }
      const lower = e.text.toLowerCase();
      if (/lowercase|word limit|length this turn|temperament|how you type|my seat|before i send/.test(lower)) m.leak += 1;
      if (e.kind === 'vote') { m.votes += 1; if (/…$/.test(e.text)) m.voteCut += 1; continue; }
      if (e.kind !== 'talk') continue;
      m.talk += 1;
      const w = e.text.split(/\s+/).filter(Boolean);
      m.words += w.length; if (w.length <= 6) m.short += 1;
      if (names.includes((lower.match(/^[a-z]+/) || [''])[0])) m.lead += 1;
      if (new RegExp(`\\b${e.who.toLowerCase()}\\b`).test(lower)) m.self += 1;
      if (/…$/.test(e.text)) m.cut += 1;
      if (/\byou (still|keep|never|wont|won't|didn'?t|haven'?t|havent|dodged)\b|\bstill (hasn'?t|hasnt|haven'?t|havent)\b|\bkeeps? (saying|asking|dodging)\b|\bnever (said|answered|explained)\b/.test(lower)) m.nag += 1;
      const t = gist(e.text); const prev = byDay[e.day] = byDay[e.day] || [];
      if (t.size >= 3 && prev.some(p => { const both = [...t].filter(x => p.has(x)).length; return both >= 3 && both / Math.min(t.size, Math.max(p.size, 1)) >= 0.6; })) m.repeat += 1;
      prev.push(t);
    }
  }
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  return { label, tables: games.length, calls: m.calls, failed: m.failed, 'cost a table': +(m.cost / Math.max(1, games.length)).toFixed(3), 'seconds a table': Math.round(m.seconds / Math.max(1, games.length)), messages: m.talk,
    'cut off %': pct(m.cut, m.talk), 'votes cut off %': pct(m.voteCut, m.votes), 'repeats %': pct(m.repeat, m.talk), 'asks again %': pct(m.nag, m.talk), 'opens on a name %': pct(m.lead, m.talk), 'own name %': pct(m.self, m.talk), 'six words or fewer %': pct(m.short, m.talk), 'words a message': +(m.words / Math.max(1, m.talk)).toFixed(1), 'says its instructions': m.leak };
}

// ----- judge -----
const SYSTEM = 'You are judging transcripts of a hidden-role party game (Traitors and Faithful, like Werewolf) played in a group chat. Lines in [brackets] are the game\'s own announcements. One player, Joe, is a scripted stand-in and says much the same things in both transcripts: ignore the quality of Joe\'s own lines. Judge only how the other players write and play.';
const ASK = 'Which transcript reads more like a table of sharp, real people playing this game in a group chat? Weigh: do messages answer each other, does each add something new rather than repeat, do people keep the facts straight (who said and did what), is the reasoning sensible, and does it read as natural chat (short, varied, no cut-off or mangled messages). Answer with the better one.';
const VERDICT = { type: 'object', additionalProperties: false, required: ['why', 'winner', 'margin'], properties: { why: { type: 'string', description: 'Two sentences at most.' }, winner: { type: 'string', enum: ['A', 'B'] }, margin: { type: 'string', enum: ['slight', 'clear'] } } };
const publicDay = (g, d) => g.log.filter(e => e.day === d && !e.priv && (e.sys ? ['death', 'banish', 'sys'].includes(e.sys) && !/^A word in private|^The mission|^Last call/.test(e.text) : ['talk', 'vote', 'last'].includes(e.kind)))
  .map(e => (e.sys ? `[${e.text}]` : `${e.who}${e.kind === 'vote' ? ' (voting)' : e.kind === 'last' ? ' (last words)' : ''}: ${e.text}`)).join('\n');
async function judge(X, Y, days, cross) {
  const model = process.env.LASTCALL_JUDGE || 'claude-opus-5-5';
  let cost = 0;
  const ask = async (a, b) => {
    const body = { model, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: `TRANSCRIPT A\n${a}\n\nTRANSCRIPT B\n${b}\n\n${ASK}` }], output_config: { effort: 'medium', format: { type: 'json_schema', schema: VERDICT } } };
    let res; let data;
    // (A key's limit on calls at once is low on a new account: wait and ask again.)
    for (let i = 0; i < 6; i++) {
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2026-10-21' }, body: JSON.stringify(body) });
      data = await res.json();
      if (res.status !== 429 && res.status < 500) break;
      await new Promise(r => setTimeout(r, 4000 * (i + 1)));
    }
    if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
    const pr = PRICES[model] || PRICES['claude-opus-5-5'];
    cost += (data.usage.input_tokens * pr[0] + data.usage.output_tokens * pr[1]) / 1e6;
    return JSON.parse(data.content.filter(c => c.type === 'text').map(c => c.text).join(''));
  };
  const pairs = [];
  for (const d of days) for (const a of load(X)) for (const b of load(Y)) {
    if (!cross && a.seed !== b.seed) continue;
    const ta = publicDay(a, d); const tb = publicDay(b, d);
    if (ta.split('\n').length >= 6 && tb.split('\n').length >= 6) pairs.push({ d, sa: a.seed, sb: b.seed, ta, tb });
  }
  let x = 0; let y = 0;
  const notes = [];
  // Each pair is judged twice, once in each order, so that coming first counts for nothing.
  const todo = pairs.flatMap(p => [false, true].map(flip => ({ p, flip })));
  const worker = async () => { for (let job = todo.shift(); job; job = todo.shift()) { const { p, flip } = job; const r = await ask(flip ? p.tb : p.ta, flip ? p.ta : p.tb); const won = (r.winner === 'A') !== flip; if (won) x += 1; else y += 1; notes.push(`day ${p.d}, seeds ${p.sa}/${p.sb}, ${flip ? Y : X} first: ${won ? X : Y} (${r.margin}). ${r.why}`); } };
  await Promise.all([worker(), worker()]);
  fs.writeFileSync(path.join(OUT, `judge ${X} vs ${Y}.txt`), notes.join('\n'));
  console.log(`${X} ${x} : ${y} ${Y}   (${pairs.length} pairs, each in both orders; judged by ${model}, about $${cost.toFixed(2)})`);
}

(async () => {
  const [cmd, ...a] = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  if (cmd === 'scores') { for (const l of a) console.log(JSON.stringify(scores(l, load(l)))); return; }
  if (cmd === 'play') {
    need();
    const [label, model, seeds, maxDay, variant] = a;
    const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
    const games = (await Promise.all(seeds.split(',').map(s => play(browser, model, Number(s), Number(maxDay || 3), variant || 'shipped').catch(e => { console.error(`table ${s} failed: ${String(e).slice(0, 300)}`); return null; })))).filter(Boolean);
    await browser.close();
    const res = scores(label, games);
    fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify({ scores: res, model, variant: variant || 'shipped', games }, null, 1));
    console.log(JSON.stringify(res));
    return;
  }
  if (cmd === 'judge') { need(); await judge(a[0], a[1], String(a[2] || '1').split(',').map(Number), a[3] === 'cross'); return; }
  console.error('Usage: node tests/lastcall-tune.cjs play <label> <model> <seeds> <maxDay> [variant] | judge <labelX> <labelY> <days> [cross] | scores <label> ...');
  process.exit(2);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
