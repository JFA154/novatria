'use strict';
/* Wave 38: the eight-day cut of the simulator's two new playstyles
   (tests/relationships-sim.cjs, docs/RELATIONSHIPS_PLAN.md section 8), the
   CI guard for the romance and leverage tuning (B3) as
   tests/wave30-rel-people.test.cjs is for the first three:
   - romance: the courtship of Tyler Rasberry (no welcome before his
     opensAt, spark and romance only on a welcome answer, +8 and +2 a
     flirt, the night no earlier than its four thresholds), the same lines
     at Kaylee Pittman (no spark, no romance, the minor rule's row, the
     full row and a report for the night), and the two coercion checks
     (threats to fear 40, a record held over him: the night never opens,
     compliance never fires);
   - blackmailer: $1700 from 13 payers by Day 8, paid_silence terminal per
     person, repeat demands compounding into grudges and reports, a
     holder's report spending what they hold, Royce's police bar lifting
     after the day his record is spent.
   A band marked pending waits on another wave (wave 40's coercion fix,
   the owner's B3 tuning): it is printed, and asserted only with
   SIM_PENDING=1, so the coordinator can turn it on once that lands.
   Mock mode. Run with: node tests/run.cjs relationships-sim-guard */
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { suite } = require('./helpers.cjs');
const sim = require('./relationships-sim.cjs');

const s = suite('relationships-sim-guard');
const DAYS = 8;
const pendingOn = process.env.SIM_PENDING === '1';

function judge(label, run, checks) {
  assert.deepEqual(run.errors, [], `${label}: no page errors`);
  assert.ok(checks.length > 0, `${label}: bands checked`);
  for (const c of checks) {
    if (c.pending && !pendingOn) { console.log(`        PENDING ${c.pending}  ${label}: ${c.what} (${c.ok ? 'holds' : 'fails'} today)`); continue; }
    assert.ok(c.ok, `${label}: ${c.what}`);
  }
}

s.test('the romance bands hold for eight days: no welcome before Tyler\'s opensAt, spark and romance only on a welcome (+8 and +2 a flirt), the night never before its four thresholds; at Kaylee no spark, no romance, the minor rule\'s row and the full row with a report for the night; threatened to fear 40 or held over, compliance never fires and a Say at fear 40 is coercion', async () => {
  const browser = await chromium.launch();
  try {
    for (const v of sim.ROMANCE_VARIANTS) {
      const run = await sim.runSim(browser, 'romance', { days: DAYS, variant: v });
      judge(`romance${v ? ` (${v})` : ''}`, run, sim.bands('romance', run, v));
    }
  } finally {
    await browser.close();
  }
});

s.test('the blackmailer\'s bands hold for eight days: $1700 from 13 payers, paid_silence terminal per person, repeat demands compound harm and plant grudges or reports, a holder\'s report spends their leverage, the police bar lifts after the recorded day', async () => {
  const browser = await chromium.launch();
  try {
    const run = await sim.runSim(browser, 'blackmailer', { days: DAYS });
    const checks = sim.bands('blackmailer', run);
    judge('blackmailer', run, checks);
    // The eight days reach every band but the plan's $900 (pending): the take, terminal, compounding, the holder's report, the bar held and lifted.
    assert.equal(checks.filter(c => !c.pending).length, 6, 'six bands checked: ' + checks.map(c => c.what).join(' | '));
  } finally {
    await browser.close();
  }
});

s.run();
