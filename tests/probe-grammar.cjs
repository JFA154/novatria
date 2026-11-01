'use strict';
/* The live grammar probe (wave 28; docs/relationships/integration.md 5.8).
   Not a .test. file: tests/run.cjs skips it, since it needs a key and the
   network. It opens the game headless (quickStart, seed 12345), plays one
   mock turn in Say mode at Pittman's for a real bookkeeper packet
   (Pipeline.bookkeeperPacket and the turn's lines, as kept for the Debug
   export) and builds the parser's packet for "I flirt with Jodie"
   (Pipeline.parsePacket). The page builds every body (Api.requestBody) and
   the headers (Api.headers). Then, for each model, Node posts: the new
   record_changes (34 properties, 3 enums), its 11-field core, the new
   parse_action (14), and the control, record_changes as it was at 56e69f5
   (41/4, the shape known to pass). It prints the status, the request-id,
   the stop reason, the counts, the socialEvents the page reads from the
   reply (Api.recordFromWire) and the parser's romantic.
   It passes (exit 0) when every request returns 200, no reply mentions
   "grammar", each model's record_changes reply yields at least one known
   event, and State.apply of it, as the bookkeeper's on a copy of the turn,
   rejects nothing.
   Run with: ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs
   PROBE_MODELS=a,b names the models (default: the bookkeeper and parser
   model of the Standard and Thrifty presets, at each preset's effort).
   PROBE_DRY=1 builds every request and stops before the network. */
const { chromium } = require('playwright');
const { quickStart, GAME_URL } = require('./helpers.cjs');

// record_changes at 56e69f5 (before wave 28): the control, 41 properties and 4 enums.
const CONTROL = {"type":"object","properties":{"attitudeChanges":{"type":"array","items":{"type":"object","properties":{"npcId":{"type":"string"},"delta":{"type":"integer"}},"required":["npcId","delta"],"additionalProperties":false}},"newMemories":{"type":"array","items":{"type":"object","properties":{"npcId":{"type":"string"},"text":{"type":"string","description":"Under twelve words, from this person's point of view, only for something they would hold against the player or thank them for later; no scene detail."},"weight":{"type":"integer","enum":[1,2,3],"description":"1 small, 2 notable, 3 serious (a threat, a betrayal, a fight, real help)"}},"required":["npcId","text","weight"],"additionalProperties":false}},"goldDelta":{"description":"Change in the player's money, in whole units of the town's currency (negative when spending), or null","anyOf":[{"type":"integer"},{"type":"null"}]},"hpDelta":{"description":"Change in the player's HP, or null","anyOf":[{"type":"integer"},{"type":"null"}]},"itemsGained":{"type":"array","items":{"type":"string"},"description":"Item names or ids the player now carries"},"itemsLost":{"type":"array","items":{"type":"string"},"description":"Inventory item ids or names the player no longer carries"},"conditionsAdded":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"effect":{"type":"string","description":"e.g. \"-1 might\""},"untilDay":{"type":"integer"}},"required":["name","effect","untilDay"],"additionalProperties":false}},"playerLocationId":{"description":"Where the player is now, if the narration moved them; otherwise null","anyOf":[{"type":"string"},{"type":"null"}]},"npcKnownToPlayer":{"type":"array","items":{"type":"string"},"description":"NPC ids the player has now met or learned the name of"},"threadUpdates":{"type":"array","items":{"type":"object","properties":{"threadId":{"type":"string"},"status":{"anyOf":[{"type":"string","enum":["open","resolved","failed"]},{"type":"null"}]},"knownToPlayer":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"summary":{"anyOf":[{"type":"string"},{"type":"null"}]}},"required":["threadId","status","knownToPlayer","summary"],"additionalProperties":false}},"clockNudges":{"type":"array","items":{"type":"object","properties":{"factionId":{"type":"string"},"delta":{"type":"integer","description":"1 when the action helps the aim, -1 when it hinders it"}},"required":["factionId","delta"],"additionalProperties":false},"description":"Only when the action plainly helps (+1) or hinders (-1) the aim of the faction's CLOCK shown in FACTIONS; at most one, usually none"},"newSeeds":{"type":"array","items":{"type":"object","properties":{"effect":{"type":"string","description":"What will happen later and why, in one sentence"},"triggerType":{"type":"string","description":"One of: day, location, npc, clock"},"triggerValue":{"type":"string","description":"day: a day number at least tomorrow; location: loc_ id; npc: npc_ id; clock: fac_id:segment"}},"required":["effect","triggerType","triggerValue"],"additionalProperties":false},"description":"Usually empty: only a concrete later event the narration sets up"},"rumoursHeard":{"type":"array","items":{"type":"string"},"description":"Rumour ids the narration shows the player hearing"},"placesRevealed":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","description":"The short name a local would call it: \"Dewayne's house\" for where Dewayne lives, \"the bait shop\". Never the directions to it (\"past the bridge\", \"up the river road\"): those belong in description"},"type":{"type":"string","enum":["house","shop","bar","spot","church","farm","dock","road","other"],"description":"What kind of place it is"},"description":{"type":"string","description":"One sentence built only from what was said about it"},"nearId":{"type":"string","description":"The id of the listed place it is reached from: usually where the player is, or the listed place it was described relative to"},"ownerNpcId":{"description":"A listed person's id when it is their home or business, else null","anyOf":[{"type":"string"},{"type":"null"}]},"kind":{"type":"string","enum":["home","business","spot","other"]}},"required":["name","type","description","nearId","ownerNpcId","kind"],"additionalProperties":false},"description":"A specific place someone in the narration named that is not in LOCATIONS; at most one, usually none"},"npcFates":{"type":"array","items":{"type":"string"},"description":"What the narration shows happening to someone present, written \"npc_id: status\" with the status one of arrested, gone (left town for good), dead or hurt (laid up for days): \"npc_wade: hurt\"; at most one, usually none"},"memoriesSettled":{"type":"array","items":{"type":"string"},"description":"Memories this turn settles (a debt paid, a grudge made up, a promise kept), each written \"npc_id: the memory as their remembers list words it\"; usually none"},"obligationsSettled":{"type":"array","items":{"type":"string"},"description":"Ids of OPEN obligations the narration shows being met; usually none"},"journalEntry":{"description":"One plain line for the player's journal, or null","anyOf":[{"type":"string"},{"type":"null"}]}},"required":["attitudeChanges","newMemories","goldDelta","hpDelta","itemsGained","itemsLost","conditionsAdded","playerLocationId","npcKnownToPlayer","threadUpdates","clockNudges","newSeeds","rumoursHeard","placesRevealed","npcFates","memoriesSettled","obligationsSettled","journalEntry"],"additionalProperties":false};

const KEY = process.env.ANTHROPIC_API_KEY || '';
const DRY = process.env.PROBE_DRY === '1';
const count = schema => {
  let props = 0, enums = 0;
  const walk = x => { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { if (x.type === 'object' && x.properties) props += Object.keys(x.properties).length; if (Array.isArray(x.enum) && x.type !== 'null') enums += 1; Object.values(x).forEach(walk); } };
  walk(schema);
  return { props, enums, top: Object.keys((schema && schema.properties) || {}).length };
};
const textOf = data => ((data && data.content) || []).filter(b => b && b.type === 'text').map(b => b.text).join('');

async function main() {
  if (!KEY && !DRY) { console.log('probe-grammar: set ANTHROPIC_API_KEY (or PROBE_DRY=1 to build the requests only).'); process.exitCode = 2; return; }
  const browser = await chromium.launch();
  const context = await browser.newContext();
  // The page itself never reaches the network: Node posts the requests.
  await context.route('**/*', route => (/^(file|blob|data):/.test(route.request().url()) ? route.continue() : route.abort()));
  const page = await context.newPage();
  page.on('pageerror', e => console.log('page error:', e.message));
  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.Game && window.Game.App);
  await quickStart(page, { seed: 12345, kinds: [] });
  const built = await page.evaluate(async control => {
    const G = Game, S = G.State, A = G.Api;
    A.Mock.delay = 0;
    S.apply({ setTime: { day: 2, phase: 'morning' } });
    S.apply({ playerLocationId: 'loc_pittmans' });
    S.apply({ visits: ['npc_royce', 'npc_jodie'].map(id => ({ npcId: id, locationId: 'loc_pittmans' })) });
    G.Storage.saveSettings({ keepPackets: true });
    await G.Pipeline.submit("Royce, you're a liar and a cheat, and everybody at this register knows it.", { mode: 'say', to: 'npc_royce' });
    G.Storage.saveSettings({ keepPackets: false });
    const kept = G.Pipeline.bookTurns;
    const book = kept.length ? kept[kept.length - 1].packet : G.Pipeline.bookkeeperPacket(G.Pipeline.lastTurn.ctx);
    const parse = G.Pipeline.parsePacket('I flirt with Jodie', { mode: 'action' }).text;
    const body = (role, user, schema) => A.requestBody(role, { system: role === 'parser' ? A.SYSTEM.parser : A.SYSTEM.bookkeeper, user, schema });
    return {
      book, parse, headers: A.headers('KEY'), endpoint: A.ENDPOINT,
      presets: Object.fromEntries(Object.entries(G.Storage.PRESETS).map(([k, p]) => [k, { model: p.parserModel, effort: p.effort }])),
      cases: [
        { name: 'record_changes', role: 'bookkeeper', schema: A.SCHEMAS.record_changes, body: body('bookkeeper', book, A.SCHEMAS.record_changes) },
        { name: 'core', role: 'bookkeeper', schema: A.SCHEMAS.record_changes_core, body: body('bookkeeper', book, A.SCHEMAS.record_changes_core) },
        { name: 'parse_action', role: 'parser', schema: A.SCHEMAS.parse_action, body: body('parser', parse, A.SCHEMAS.parse_action) },
        { name: 'control 56e69f5', role: 'bookkeeper', schema: control, body: body('bookkeeper', book, control) }
      ]
    };
  }, CONTROL);
  const presets = ['standard', 'thrifty'].map(k => built.presets[k]).filter(Boolean);
  const named = String(process.env.PROBE_MODELS || '').split(',').map(x => x.trim()).filter(Boolean);
  const models = named.length ? named : [...new Set(presets.map(p => p.model))];
  const effortOf = (model, role) => { const p = presets.find(x => x.model === model) || presets[0]; return (p && p.effort && p.effort[role]) || 'low'; };
  console.log(`probe-grammar: ${models.join(', ')}; bookkeeper packet ${built.book.length} chars, parser packet ${built.parse.length} chars`);
  for (const c of built.cases) { const n = count(c.schema); console.log(`  ${c.name}: ${n.top} top-level fields, ${n.props} properties, ${n.enums} enums`); }
  if (DRY) { console.log('PROBE_DRY: every request is built; stopping before the network.'); await browser.close(); return; }
  let ok = true;
  const fail = why => { ok = false; console.log(`    FAIL ${why}`); };
  for (const model of models) {
    for (const c of built.cases) {
      const body = Object.assign({}, c.body, { model, output_config: Object.assign({}, c.body.output_config, { effort: effortOf(model, c.role) }) });
      const headers = Object.assign({}, built.headers, { 'x-api-key': KEY });
      let status = 0, rid = null, raw = '', data = null;
      try {
        const res = await fetch(built.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
        status = res.status; rid = res.headers.get('request-id'); raw = await res.text();
        try { data = JSON.parse(raw); } catch (e) { data = null; }
      } catch (err) { raw = String((err && err.message) || err); }
      console.log(`${model} ${c.name}: ${status || 'no reply'} request-id ${rid || '-'} stop ${(data && data.stop_reason) || '-'}${data && data.usage ? ` in ${data.usage.input_tokens} out ${data.usage.output_tokens}` : ''}`);
      if (status !== 200) fail(`status ${status || raw}: ${raw.slice(0, 300)}`);
      if (/grammar/i.test(raw)) fail('the reply mentions "grammar"');
      if (status !== 200) continue;
      let reply = null;
      try { reply = JSON.parse(textOf(data)); } catch (e) { fail('the reply is not JSON: ' + textOf(data).slice(0, 200)); continue; }
      if (c.role === 'parser') { console.log(`    actionType ${reply.actionType}, targets ${JSON.stringify(reply.targets)}, romantic ${JSON.stringify(reply.romantic)}`); continue; }
      if (c.name.startsWith('control')) { console.log(`    fields ${Object.keys(reply).filter(k => Array.isArray(reply[k]) ? reply[k].length : reply[k] !== null).join(', ') || 'none'}`); continue; }
      const read = await page.evaluate(reply => {
        const G = Game, S = G.State, A = G.Api;
        const diff = A.recordFromWire(reply);
        const events = (diff.socialEvents || []).map(e => ({ wire: `${e.npcId} ${e.event}${e.aboutId ? ' ' + e.aboutId : ''}${e.private ? ' private' : ''}: ${e.text}`, known: !!G.Rel.WIRE_EVENTS[e.event] }));
        const snap = S.snapshot();
        S.apply({ beginTurn: true });
        const r = S.apply(diff, { source: 'model', present: S.npcsAt(S.current.player.locationId).map(n => n.id), speechTo: 'npc_royce', actionType: 'talk' });
        S.restore(snap);
        return { events, wire: reply.socialEvents || [], rejected: r.rejected, applied: r.applied.filter(x => /social|event/i.test(x)) };
      }, reply);
      console.log(`    socialEvents ${JSON.stringify(read.wire)}`);
      for (const e of read.events) console.log(`      ${e.known ? 'known' : 'UNKNOWN'} ${e.wire}`);
      if (read.applied.length) console.log(`    applied ${read.applied.join(' | ')}`);
      if (c.name === 'record_changes' && !read.events.some(e => e.known)) fail('no known event in the reply');
      if (read.rejected.length) fail('State.apply rejected: ' + JSON.stringify(read.rejected));
    }
  }
  await browser.close();
  console.log(ok ? 'PROBE PASSED' : 'PROBE FAILED');
  process.exitCode = ok ? 0 : 1;
}
main().catch(err => { console.log('probe-grammar:', (err && err.stack) || err); process.exitCode = 1; });
