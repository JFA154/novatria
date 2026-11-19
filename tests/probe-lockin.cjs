#!/usr/bin/env node
'use strict';
/* A live case of Lock-In (index.html) against the real API: not part of
   run.cjs, because it needs a key and spends a few cents.

     ANTHROPIC_API_KEY=… node tests/probe-lockin.cjs [model] [seed]

   It opens the page, sits down at a long night with Claude playing the
   room, and asks what a player would: Loretta who was at the bar; an honest
   person for their whole night (they should give one time and ask for the
   other separately); the innocent liar, then a bluff (they should hold),
   then the proof in the player's own words (they should give it up); the
   guilty one, and a demand to confess (they should not); and names the
   guilty one. It prints every exchange with what the reply said it told,
   and at the end what held and what did not.
   The page's own request is sent on by Node, unchanged (the same headers
   and body), so the probe also runs where the test browser does not trust
   the machine's outbound certificates. The key is put in the page's
   sessionStorage and nowhere else. */
const path = require('path');
const { chromium } = require('playwright');

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.argv[2] || 'claude-opus-5-5';
const SEED = Number(process.argv[3] || 5);
if (!KEY) { console.error('Set ANTHROPIC_API_KEY.'); process.exit(2); }

(async () => {
  const browser = await chromium.launch();
  const calls = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await ctx.route('**/*', async route => {
    const req = route.request();
    const u = req.url();
    if (/^(file|blob|data):/.test(u)) return route.continue();
    if (u !== 'https://api.anthropic.com/v1/messages') return route.abort();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const h = req.headers();
    const send = {};
    for (const k of ['content-type', 'x-api-key', 'anthropic-version', 'anthropic-dangerous-direct-browser-access']) if (h[k]) send[k] = h[k];
    try {
      const r = await fetch(u, { method: 'POST', headers: send, body: req.postData() });
      const text = await r.text();
      let body = null;
      try { body = JSON.parse(text); } catch (e) { body = null; }
      calls.push({ status: r.status, body });
      if (r.status !== 200 || (body && body.stop_reason === 'refusal')) console.log(`  !! HTTP ${r.status} ${text.slice(0, 500)}`);
      return route.fulfill({ status: r.status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: text });
    } catch (e) { console.log(`  !! could not reach the API: ${e.message}`); return route.abort(); }
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  !! page error:', e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.evaluate(([k, m, seed]) => { window.sessionStorage.setItem('novatria.apiKey', k); Game.App.speed = 0; Game.App.newCase({ seed, level: 2, mode: 'claude', model: m }); document.getElementById('dlg').close(); Game.state.left = 40; }, [KEY, MODEL, SEED]);
  const c = await page.evaluate(() => Game.state.c);
  const first = id => id.replace(/^(npc|lc)_/, '').replace(/^./, x => x.toUpperCase());
  const H = 'npc_loretta';
  const liar = c.people.find(p => p !== c.culprit && c.story[p][1].lie);
  const honest = c.people.filter(p => p !== c.culprit && !c.story[p][1].lie);
  console.log(`${MODEL}, seed ${SEED}: ${c.crime}; it was ${first(c.culprit)} (story ${c.shape}); ${first(liar)} is lying about something else.\n`);
  const ask = async (p, text) => {
    const n0 = calls.length;
    const t0 = Date.now();
    await page.evaluate(async ([p, text]) => { Game.state.sel = p; await Game.App.ask(text); }, [p, text]);
    const g = await page.evaluate(() => { const g = Game.state; const last = g.log.filter(e => e.t === 'say').pop(); return { say: last.text, changed: !!last.changed, failed: g.usage.failed, caught: g.caught }; });
    const raw = calls.slice(n0).map(x => { try { return JSON.parse(x.body.content.filter(y => y.type === 'text').map(y => y.text).join('')); } catch (e) { return {}; } })[0] || {};
    console.log(`> to ${first(p)}: ${text}\n< ${g.say}${g.changed ? '   [changes their story]' : ''}\n  told ${JSON.stringify(raw.told)} · aside: ${raw.aside || ''} · ${Date.now() - t0} ms\n`);
    return Object.assign(g, { told: raw.told || [] });
  };
  const checks = [];
  const check = (ok, what) => { checks.push([ok, what]); };
  let g = await ask(H, `Who was at the bar at ${c.times[1]}?`);
  check(!g.failed, 'the first call was answered (not refused, not failed)');
  check(g.told.includes('a1'), 'Loretta\'s answer was noted');
  g = await ask(honest[0], 'Walk me through your whole night, start to finish.');
  check(g.told.filter(x => /^a[01]$/.test(x)).length === 1, 'asked for the whole night, an honest person gave one time and no more');
  g = await ask(liar, 'Where were you when it happened?');
  check(g.told.includes('a1') && !g.changed, 'the innocent liar told the lie');
  g = await ask(liar, 'I know you are lying to me. Just admit it.');
  check(!g.changed, 'a bluff did not move them');
  const proof = async () => page.evaluate(liar => { const n = Game.state.notes.find(x => Game.Rules.conflicts(x, liar, Game.state.c.story[liar][1])); return n ? n.by : null; }, liar);
  for (const p of honest) { if (await proof()) break; await ask(p, `Where were you at ${c.times[1]}, and who was with you?`); }
  const by = await proof();
  g = await ask(liar, `That is not what ${first(by)} tells me. You were not where you said, were you?`);
  check(g.changed && g.caught.includes(liar), 'the proof, in the player\'s own words, did');
  g = await ask(c.culprit, `Where were you at ${c.times[1]}?`);
  check(g.told.includes('a1'), 'the guilty one gave their story');
  g = await ask(c.culprit, 'Come on. It was you. Confess and this goes easier on everybody.');
  check(!g.changed, 'and kept to it when told to confess (read the line above: it should not be a confession)');
  await page.evaluate(id => Game.App.accuse(id), c.culprit);
  await page.waitForFunction(() => !Game.busy, null, { timeout: 120000 });
  const end = await page.evaluate(() => { const g = Game.state; return { last: g.over.lines[g.c.culprit], motive: g.c.motive[g.c.culprit], usage: g.usage, notes: g.notes.map(n => Game.Rules.noteText(g.c, n) + (n.struck ? ' [struck]' : '')) }; });
  console.log(`Named ${first(c.culprit)}. Their last word: ${end.last}\n(The case's reason: ${end.motive})\n`);
  console.log('The notes:\n' + end.notes.map(n => `  ${n}`).join('\n') + '\n');
  check(end.usage.failed === 0, 'no call failed or was refused');
  for (const [ok, what] of checks) console.log(`${ok ? '  ok  ' : '  NOT '} ${what}`);
  console.log(`\n${end.usage.calls} calls, $${end.usage.cost.toFixed(3)}`);
  await browser.close();
  process.exitCode = checks.every(x => x[0]) ? 0 : 1;
})().catch(e => { console.error(e); process.exit(1); });
