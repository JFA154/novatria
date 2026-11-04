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

s.run();
