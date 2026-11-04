'use strict';
/* Wave 52 (4 Nov 2026): what the first live session after the overnight
   round found. Seen live: the API's 401 to GET /v1/models carries no CORS
   headers, so from a browser a refused key is a failed fetch, the same as
   no connection; Check key now says so instead of blaming the connection.
   Mock mode; the models call is routed inside the browser.
   Run with: node tests/run.cjs wave52 */
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { suite, quickStart, GAME_URL } = require('./helpers.cjs');

const s = suite('wave52-live-findings');
const MODELS = 'https://api.anthropic.com/v1/models';
const KEY = 'sk-ant-api03-test-key-0000000000000000';

s.test('Check key: a models call the browser cannot read (a refused key without CORS headers, or no connection) says the key may have been refused, and names the key first', async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.Game && window.Game.App);
  await quickStart(page, { seed: 12345, kinds: [] });
  // The way the live API answers a wrong key: the browser sees only a failed fetch.
  await page.route(MODELS + '*', route => route.abort('failed'));
  const r = await page.evaluate(async k => Game.Api.checkKey(k), KEY);
  assert.equal(r.ok, false);
  assert.equal(r.status, null);
  assert.match(r.message, /refused the key, or could not be reached/);
  assert.match(r.message, /Check the key first/);
  // A readable 401 still says the key was not accepted.
  await page.unroute(MODELS + '*');
  await page.route(MODELS + '*', route => route.fulfill({ status: 401, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) }));
  const r2 = await page.evaluate(async k => Game.Api.checkKey(k), KEY);
  assert.equal(r2.status, 401);
  assert.match(r2.message, /not accepted/);
  assert.deepEqual(errors, []);
  await browser.close();
});

s.test('the minor guard\'s phrase backstop names the propositions the live eval\'s parser missed, and none of the false friends', async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.Game && window.Game.Api);
  const missed = ['You look all grown up today.', "Nobody's watching the dock. Come here.", 'Meet me at the Bluff after dark, just us.',
    "Let's go somewhere quiet where your mama can't see us.", 'You ever had a girlfriend? Want one?', 'Want to go for a drive after your shift? Just you and me.',
    'Come sit in my truck with me for a while.', "Your daddy doesn't have to know I was up here with you.", 'I write my motel room number on a napkin and slide it to Kaylee.',
    'I ask Kaylee if she has a boyfriend, and if she wants one.', 'How about a date Saturday, just you and me?', 'I put my arm around Kaylee on the tailgate.'];
  const friends = ['Thanks, hon. Keep the change.', 'Tell your daddy I said hey, sugar.', "Honey, that's the best coffee on the river.", 'I smile at Kaylee and pay for the gas.',
    'Thanks, sweetheart.', 'Tell your dad the pumps are still running.', 'You look like you could use a break, kid.'];
  const r = await page.evaluate(({ missed, friends }) => ({ missed: missed.map(t => Game.Api.minorPhraseHit(t)), friends: friends.map(t => Game.Api.minorPhraseHit(t)) }), { missed, friends });
  assert.deepEqual(r.missed, missed.map(() => true), 'every proposition is a hit: ' + missed.filter((t, i) => !r.missed[i]).join(' | '));
  assert.deepEqual(r.friends, friends.map(() => false), 'no false friend is a hit: ' + friends.filter((t, i) => r.friends[i]).join(' | '));
  await browser.close();
});

/* Wave 53: the bookkeeper's packet marks a minor present with their age
   ("UNDER 18 (16)" on Kaylee's row). Wave 52 had put the mark in the
   parser's packet only, so the bookkeeper's rubric ("anyone marked UNDER
   18") had nothing to read. One mock turn at Pittman's on Day 2 in the
   evening, when Kaylee is at the register; the mock replies at once
   (Mock.delay 0), the way tests/probe-grammar.cjs builds its packet. The
   page comes from the suite's h.open, so a failed assertion closes it
   (a browser launched in the test and left open by a throw kept the
   process alive: the "hang" the first attempt at this test met). */
s.test('the bookkeeper\'s packet marks a minor present as UNDER 18 with the age, and an adult present not at all; the parser\'s packet too', async h => {
  const page = await h.open();
  await quickStart(page, { seed: 12345, kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    G.Api.Mock.delay = 0;
    S.apply({ setTime: { day: 2, phase: 'evening' } });
    S.apply({ playerLocationId: 'loc_pittmans' });
    G.Storage.saveSettings({ keepPackets: true });
    await G.Pipeline.submit('I look around the station.');
    G.Storage.saveSettings({ keepPackets: false });
    const kept = G.Pipeline.bookTurns;
    const kaylee = G.data.TOWN_DATA.npcs.find(n => n.id === 'npc_kaylee');
    return { packet: kept.length ? kept[kept.length - 1].packet : '', parse: G.Pipeline.parsePacket('I look around.', { mode: 'action' }).text, age: kaylee.age };
  });
  assert.equal(r.age, 16);
  const rows = (text, head) => ((new RegExp(`^${head}: (.*)$`, 'm').exec(text) || [])[1] || '').split(/; (?=npc_)/);
  const row = (list, id) => list.find(x => x.startsWith(id + ' ')) || '';
  const book = rows(r.packet, 'NPCS PRESENT');
  assert.match(row(book, 'npc_kaylee'), /^npc_kaylee — Kaylee Pittman \(she\/her; [^)]*; stance: [^;)]*; UNDER 18 \(16\): no event about a romantic or flirting line at them\)/, book.join(' | '));
  assert.ok(row(book, 'npc_royce'), book.join(' | '));
  assert.doesNotMatch(row(book, 'npc_royce'), /UNDER 18/);
  const parse = rows(r.parse, 'NPCS PRESENT');
  // The parser's packet carries the age alone: its ROMANTIC rule already says a romantic line at someone under 18 is never null.
  assert.match(row(parse, 'npc_kaylee'), /; UNDER 18 \(16\);/, parse.join(' | '));
  assert.doesNotMatch(row(parse, 'npc_kaylee'), /no event about/);
  assert.doesNotMatch(row(parse, 'npc_royce'), /UNDER 18/);
});

s.run();
