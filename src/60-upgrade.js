// ===== Module: Upgrade =====
/* Bringing a game saved under older rules up to date. state.meta.rulesVersion
   says which rules a game has been brought up to (State.RULES_VERSION for a
   new game; a save without it reads as 1). MIGRATIONS is the ordered list of
   steps, { version, title, rerun, run(state, api) -> summary }; run makes its
   changes through State.apply and resolves to { text, ... } for the feed, or
   throws (a refusal throws { refused: true }). Pipeline.updateGame runs the
   steps newer than the game, or at the current version the ones marked
   rerun ("Re-read this game with the latest rules"), as one State batch and
   one /undo step, then stamps the version. A game that is not updated plays
   on exactly as it is.

   Version 2, "Memories that matter": the bookkeeper now records only what a
   person would hold against the player or thank them for, one short line
   from their point of view (Api.MEMORY_RULES). Older games hold long
   play-by-play memories. Everyone with a memory the engine did not write
   itself (PROTECTED: the loose-end lines and story-point facts, which stay
   exactly as they are) goes to the bookkeeper model in one structured-output
   call (split by person past CHUNK memories), which returns each person's
   kept lines as { from: [numbers], text, weight }. A line keeps the earliest
   turn of the memories it came from, is cut like a bookkeeper memory
   (State.shortMemory) and a person keeps at most PER_PERSON; the result
   replaces their memories through State.apply({ setMemories }).

   Version 3, "Places people told you about": the bookkeeper now turns a
   specific place someone names into a real place (placesRevealed). An older
   game's story may already hold such a line. The whole log (each turn's
   input and narration) and the chronicle summaries, labelled as summaries,
   go to the bookkeeper model in one structured-output call (Api.revealPlaces,
   SYSTEM.places, which states the bookkeeper's PLACE_RULE word for word)
   with every place (id, name, type) and person (id, name); it returns
   placesRevealed entries in the bookkeeper's shape plus the turn the
   mention came from. A nearId that is not a known place becomes the
   player's current place; a turn that is not in the log becomes the current
   turn. They go through State.apply as the engine: the duplicate check, the
   validation and the per-game cap hold, the one-a-turn limit does not, and
   each gets the same map spot, "heard of" marker, home schedule and
   revealed record as one the bookkeeper adds. Nothing to read (an empty
   log) costs no call.

   Version 4, "Clock follows the story": a short action no longer crosses
   from night into morning (State advanceTime), but an older game's clock
   may already have ticked into morning in the middle of a night scene. The
   clock (day, phase, shorts) and the last CLOCK_ENTRIES log entries (input
   and narration, oldest first, each stamped with the clock it was narrated
   at) go to the bookkeeper model in one structured-output call (Api.checkClock,
   SYSTEM.clock), which answers { behind, phase, dayOffset (0 or -1),
   reason }. Only a reply that is behind and puts the story earlier than the
   clock is applied (the clock never moves forward): day + dayOffset (at
   least 1), that phase, shorts 2 (late in the phase), late at night,
   through State.apply({ setTime }), with no world tick. Nothing to compare
   (an empty log, or the first morning, which nothing is earlier than)
   costs no call.

   Version 5, "People match the story": every person now carries pronouns,
   people the story names become real (State peopleRevealed), and a person
   the player asks for is made to fit the story (Pipeline's create_person
   call). An older game may hold someone the tables made before the story
   said who they were: "Mavis Toler", a man, whom the story calls Dewayne's
   wife. First, anyone still without pronouns gets them by the load rule
   (State.fillPronouns). Then every person made during play (anyone not in
   the town data: the tables, a context call, the story, a loose end, a
   story point) whom the story mentions, by name or by their relation
   phrase, goes to the bookkeeper model in one structured-output call
   (Api.fixPeople, SYSTEM.people) with their record and every log narration
   and chronicle summary that mentions them (at most MENTIONS each, the
   latest), the places and everyone in the game; it returns each record
   corrected (name, pronouns, role, look, voice, relationToNpcId, relation,
   homeLocationId). Only what changed goes through State.apply({ fixPeople
   }): the id and memories stay, and a home given moves them in there.
   Nobody to check costs no call. Cast members count as town people here
   even before version 6 has added them (madeUp).

   Version 6, "A full cast": the owner's direction of 29 Oct 2026 (the
   game made people up on demand, and a wife came out a man at the gas
   station with no voice). Every person who can appear is now written by
   hand in TOWN_DATA, with relations, a home and a schedule, and the game
   never makes one. An older game gains every cast member and home it
   lacks, folds the homes people told the player about into the cast's
   own, merges the people it made up onto the cast members they were
   (Mavis Toler, Dewayne's wife, becomes Mavis Mangum, keeping what she
   remembers and every turn that names her), keeps anyone nobody matches
   for the player to edit or remove, and is marked castFixed (fullCast).
   It is deterministic: no call, in mock mode or with the API. */
const Upgrade = (() => {
  const PROTECTED = Object.freeze([/^Loose end with /i, /^Fact \(a story point\):/i]);
  const PER_PERSON = 6;
  const CHUNK = 40;
  const NOTICES = {
    start: 'Updating this game to the latest rules...',
    refused: 'The model declined to re-read this game, so nothing was changed. You can keep playing it as it is.',
    failed: 'Nothing was changed; the game is as it was.'
  };
  // The loose end's own line (Town.looseEndMemory) is protected like the older "Loose end with" form.
  function isProtected(m) { return !!m && (PROTECTED.some(re => re.test(String(m.text || ''))) || Town.isLooseEndMemory(m.text)); }
  function behind(st) { return !!st && State.rulesVersion(st) < State.RULES_VERSION; }
  function pending(st) {
    const v = State.rulesVersion(st);
    const due = MIGRATIONS.filter(m => m.version > v);
    return due.length ? due : MIGRATIONS.filter(m => m.rerun);
  }
  function note(st, reason) { State.debugLog.push({ turn: st ? st.meta.turn : 0, kind: 'upgrade', reason }); }
  const open = n => (n.memories || []).filter(m => !isProtected(m));

  // ----- version 2: memories that matter -----
  /* Everyone with at least one memory the rewrite may touch, in groups of
     about CHUNK memories (a person is never split). */
  function candidates(st) { return st.npcs.filter(n => open(n).length > 0); }
  function chunks(npcs) {
    const out = [];
    let cur = [];
    let size = 0;
    for (const n of npcs) {
      const k = open(n).length;
      if (cur.length && size + k > CHUNK) { out.push(cur); cur = []; size = 0; }
      cur.push(n);
      size += k;
    }
    if (cur.length) out.push(cur);
    return out;
  }
  /* The packet for Api.rewriteMemories: structured (the mock reads people)
     and as labelled text (the model reads text). Memories are numbered from 1
     per person; the protected ones are not sent. */
  function memoryPacket(st, npcs) {
    const people = npcs.map(n => ({
      npcId: n.id, name: n.name, role: n.role || '',
      memories: open(n).map((m, i) => ({ n: i + 1, turn: m.turn, weight: m.weight, text: m.text }))
    }));
    const head = `PLAYER: ${st.player.name}\nTURN NOW: ${st.meta.turn}`;
    const blocks = people.map(p => [`PERSON ${p.npcId} — ${p.name}${p.role ? ` (${p.role})` : ''}`]
      .concat(p.memories.map(m => `${m.n}. [turn ${m.turn}, weight ${m.weight}] ${m.text}`)).join('\n'));
    return { playerName: st.player.name, turn: st.meta.turn, people, text: [head].concat(blocks).join('\n\n') };
  }
  /* The heaviest, then the newest, kept in their order. */
  function capLines(lines, max) {
    if (lines.length <= max) return lines;
    const keep = lines.map((l, i) => ({ l, i })).sort((a, b) => b.l.weight - a.l.weight || b.l.turn - a.l.turn || b.i - a.i).slice(0, max).map(x => x.l);
    return lines.filter(l => keep.includes(l));
  }
  /* One person's reply, made safe: only numbers that were sent, the earliest
     turn of the memories a line came from, the text cut like a bookkeeper
     memory, at most PER_PERSON lines and room left under State.MEMORY_MAX. */
  function cleanReply(st, n, reply) {
    const sent = open(n);
    const lines = [];
    for (const raw of Array.isArray(reply.memories) ? reply.memories : []) {
      if (!isObj(raw)) continue;
      const text = State.shortMemory(raw.text);
      const from = Array.from(new Set((Array.isArray(raw.from) ? raw.from : []).map(toInt))).filter(k => k !== null && k >= 1 && k <= sent.length);
      if (!text) continue;
      if (!from.length) { note(st, `${n.id}: dropped "${text}" (it names no memory it came from)`); continue; }
      const src = from.map(k => sent[k - 1]);
      const line = { turn: Math.min(...src.map(m => (Number.isInteger(m.turn) ? m.turn : 0))), text, weight: clamp(toInt(raw.weight) || 1, 1, 3) };
      if (src.some(m => m.model === true)) line.model = true;
      lines.push(line);
    }
    const room = Math.max(0, State.MEMORY_MAX - (n.memories.length - sent.length));
    const kept = capLines(lines, Math.min(PER_PERSON, room));
    if (kept.length < lines.length) note(st, `${n.id}: kept ${kept.length} of ${lines.length} rewritten lines (at most ${Math.min(PER_PERSON, room)})`);
    return kept;
  }
  async function rewriteMemories(st, api) {
    const npcs = candidates(st);
    const res = { people: 0, before: 0, after: 0, calls: 0 };
    if (!npcs.length) return Object.assign(res, { text: 'Nobody had any memories to rewrite.' });
    const replies = new Map();
    for (const group of chunks(npcs)) {
      const reply = await api.rewriteMemories(memoryPacket(st, group));
      res.calls += 1;
      if (Api.isRefusal(reply)) throw Object.assign(new Error('refused'), { refused: true, refusal: reply });
      if (State.current !== st) throw Object.assign(new Error('another game was loaded'), { replaced: true });
      for (const p of isObj(reply) && Array.isArray(reply.people) ? reply.people : []) {
        if (!isObj(p) || typeof p.npcId !== 'string' || replies.has(p.npcId)) continue;
        if (!group.some(n => n.id === p.npcId)) { note(st, `the reply named ${p.npcId}, who was not asked about; ignored`); continue; }
        replies.set(p.npcId, p);
      }
    }
    const setMemories = [];
    for (const n of npcs) {
      const r = replies.get(n.id);
      if (!r) { note(st, `${n.id} was missing from the reply; their memories are as they were`); continue; }
      const sent = open(n);
      const lines = cleanReply(st, n, r);
      // The protected lines exactly as they were, then the rewritten ones, in turn order.
      const all = n.memories.filter(isProtected).map((m, i) => ({ m, k: 0, i })).concat(lines.map((m, i) => ({ m, k: 1, i })));
      all.sort((a, b) => ((a.m.turn | 0) - (b.m.turn | 0)) || (a.k - b.k) || (a.i - b.i));
      setMemories.push({ npcId: n.id, memories: all.map(x => x.m) });
      res.people += 1;
      res.before += sent.length;
      res.after += lines.length;
    }
    if (!res.people) throw new Error('the reply did not cover anyone it was asked about');
    const applied = State.apply({ setMemories });
    if (applied.rejected.length) throw new Error('the engine refused the rewrite: ' + applied.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
    const count = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    res.text = `Rewrote memories for ${count(res.people, 'person', 'people')}: ${count(res.before, 'memory', 'memories')} became ${res.after}.`;
    return res;
  }

  // ----- version 3: places people told you about -----
  /* The packet for Api.revealPlaces: structured (the mock reads entries)
     and as labelled text (the model reads text). */
  function placesPacket(st) {
    const here = st.locations.find(l => l.id === st.player.locationId) || { id: st.player.locationId, name: '?' };
    const entries = st.chronicle.map(c => ({ kind: 'summary', fromTurn: c.fromTurn, toTurn: c.toTurn, text: c.summary }))
      .concat(st.log.filter(e => e.narration).map(e => Object.assign({ kind: 'turn' }, e)));
    const text = [
      `PLAYER: ${st.player.name}; now at ${here.id} (${here.name})`,
      `TURN NOW: ${st.meta.turn}`,
      // The places the player knows: a cast home not found yet is left out, so a line about it comes back and discovers it.
      `PLACES (the places list): ${st.locations.filter(l => l.discovered).map(l => `${l.id} — ${l.name} (${l.type})`).join('; ')}`,
      `PEOPLE: ${st.npcs.map(n => `${n.id} — ${n.name}`).join('; ') || 'none'}`,
      '',
      'STORY (a SUMMARY covers earlier turns; each TURN is what the player did and the narration they read):',
      entries.map(e => (e.kind === 'summary' ? `SUMMARY of turns ${e.fromTurn} to ${e.toTurn}: ${e.text}` : Api.chronicleText([e]))).join('\n\n')
    ].join('\n');
    return { locationId: here.id, turn: st.meta.turn, entries, text };
  }
  // ----- version 4: the clock follows the story -----
  const CLOCK_ENTRIES = 6;
  /* The packet for Api.checkClock: structured (the mock reads time and
     entries) and as labelled text (the model reads text). */
  function clockPacket(st) {
    const t = st.time;
    const time = { day: t.day, phase: t.phase, shorts: t.shorts | 0 };
    const entries = st.log.filter(e => e.narration).slice(-CLOCK_ENTRIES).map(e => Object.assign({}, e));
    const text = [
      `CLOCK NOW: day ${time.day}, ${time.phase} (${State.phasePart(t)} in the phase; ${time.shorts} of ${SHORTS_PER_PHASE} short actions gone)`,
      'PHASES, in order: morning, afternoon, evening, night, then the next day\'s morning.',
      '',
      `LAST TURNS (oldest first; the last is the latest narration; each is what the player did and the narration they read):`,
      Api.chronicleText(entries)
    ].join('\n');
    return { time, entries, text };
  }
  async function followStory(st, api) {
    const res = { calls: 0, changed: false, reply: null };
    const same = 'The clock matches the story.';
    const t = st.time;
    const packet = clockPacket(st);
    if (!packet.entries.length || (t.day === 1 && t.phase === PHASES[0])) return Object.assign(res, { text: same });
    const reply = await api.checkClock(packet);
    res.calls = 1;
    if (Api.isRefusal(reply)) throw Object.assign(new Error('refused'), { refused: true, refusal: reply });
    if (State.current !== st) throw Object.assign(new Error('another game was loaded'), { replaced: true });
    res.reply = isObj(reply) ? deepCopy(reply) : reply;
    if (!isObj(reply) || reply.behind !== true || !PHASES.includes(reply.phase)) {
      note(st, `clock: the story fits day ${t.day}, ${t.phase}${isObj(reply) && reply.reason ? ` (${cleanText(String(reply.reason), 200)})` : ''}`);
      return Object.assign(res, { text: same });
    }
    const day = Math.max(1, t.day + (toInt(reply.dayOffset) === -1 ? -1 : 0));
    const phase = reply.phase;
    const earlier = day < t.day || (day === t.day && PHASES.indexOf(phase) < PHASES.indexOf(t.phase));
    if (!earlier) {
      note(st, `clock: the reply put the story at day ${day}, ${phase}, which is not earlier than day ${t.day}, ${t.phase}; the clock never moves forward`);
      return Object.assign(res, { text: same });
    }
    const from = { day: t.day, phase: t.phase, shorts: t.shorts | 0 };
    const r = State.apply({ setTime: { day, phase, shorts: 2, late: phase === 'night' } });
    if (r.rejected.length) throw new Error('the engine refused the clock: ' + r.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
    note(st, `clock: day ${from.day}, ${from.phase} -> day ${day}, ${phase}${reply.reason ? ` (${cleanText(String(reply.reason), 200)})` : ''}`);
    return Object.assign(res, { changed: true, from, to: { day, phase }, text: `Set the clock back to day ${day}, ${phase}: the story had not reached ${from.phase}.` });
  }

  function joinNames(list) { return list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`; }
  async function revealPlaces(st, api) {
    const res = { added: [], calls: 0 };
    const none = 'No new places to add.';
    const packet = placesPacket(st);
    if (!packet.entries.length) return Object.assign(res, { text: none });
    const reply = await api.revealPlaces(packet);
    res.calls = 1;
    if (Api.isRefusal(reply)) throw Object.assign(new Error('refused'), { refused: true, refusal: reply });
    if (State.current !== st) throw Object.assign(new Error('another game was loaded'), { replaced: true });
    const here = st.player.locationId;
    const list = (isObj(reply) && Array.isArray(reply.placesRevealed) ? reply.placesRevealed : []).filter(isObj).map(p => {
      const out = Object.assign({}, p);
      const near = State.loc(p.nearId);
      if (!near || !near.discovered) { note(st, `${cleanText(String(p.name || ''), 40)}: nearId ${p.nearId} is not a known place; reached from ${here} instead`); out.nearId = here; }
      const t = toInt(p.turn);
      const entry = t === null ? null : st.log.find(e => e.turn === t);
      delete out.turn;
      if (entry) { out.turn = t; out.day = entry.day; }
      return out;
    });
    if (!list.length) return Object.assign(res, { text: none });
    const r = State.apply({ placesRevealed: list });
    for (const x of r.rejected) note(st, `place not added (${x.path}): ${x.reason}`);
    res.added = (r.revealed || []).map(id => State.loc(id).name);
    res.text = res.added.length ? `Added ${res.added.length} ${res.added.length === 1 ? 'place' : 'places'} people told you about: ${joinNames(res.added)}.` : none;
    return res;
  }

  // ----- version 5: people match the story -----
  const MENTIONS = 16;
  const MADE_BY = {
    tables: 'from random tables when the player first asked for them', context: 'to fit the story when the player first asked for them',
    story: 'when someone in the story named them', loose_end: "for one of the player's loose ends at the start", fact: 'for a story point the player spent',
    edit: 'and since edited by the player, who set who they are to whom by hand'
  };
  /* Everyone the game made during play: not in this game's town data (a
     town person the player gave a relation in the People editor has
     created.by 'edit' and is still the town's own). */
  /* The cast's ids: this game's own town data and, for a game of the
     built-in town, the full cast written in TOWN_DATA (rules version 6), so
     a cast member is a town person even in a game the update has not
     reached yet. */
  function castIds(st) {
    const ids = new Set();
    for (const t of [State.town, st && st.meta && st.meta.townName === TOWN_DATA.name ? TOWN_DATA : null, State.town ? null : TOWN_DATA]) if (t && Array.isArray(t.npcs)) t.npcs.forEach(n => ids.add(n.id));
    return ids;
  }
  /* Everyone the game made during play: not in the cast, or holding a cast
     id the game handed out in play before the cast was written (a story's
     "Mavis" made as npc_mavis). A town person the player gave a relation in
     the People editor has created.by 'edit' and is still the town's own. */
  function madeUp(st) {
    const ids = castIds(st);
    return st.npcs.filter(n => n.alive !== false && (!ids.has(n.id) || (isObj(n.created) && n.created.by !== 'edit')));
  }
  function madeBy(st, n) {
    if (isObj(n.created) && CREATED_BY.includes(n.created.by)) return n.created.by;
    return (st.player.looseEnds || []).some(le => le.npcId === n.id) ? 'loose_end' : 'tables';
  }
  function relationOf(n) {
    const c = isObj(n.created) ? n.created : {};
    return c.relationToNpcId ? State.relationPhrase(State.npc(c.relationToNpcId), c.relation) : '';
  }
  /* What the story says about someone: the log narrations and chronicle
     summaries that name them, or say their relation phrase ("Dewayne's
     wife"); oldest first, the latest MENTIONS. */
  /* Words a line says about someone's kin, for the lines from before a
     person was named ("his wife's gonna be thrilled when you knock"): how
     they came into the story, maybe. Not the tics ("my daddy used to say"). */
  const KIN_RE = /\b(wife|husband|spouse|partner|girlfriend|boyfriend|fianc[ée]e?|son|daughter|kids?|children|brother|sister|mother|father|cousin|aunt|uncle|niece|nephew|in-law)\b/i;
  const CONTEXT_MENTIONS = 4;
  function mentionsOf(st, n) {
    const rel = relationOf(n).toLowerCase();
    const hit = text => (!n.unnamed && Town.nameMentions(text, n)) || (!!rel && String(text || '').toLowerCase().replace(/[’‘]/g, "'").includes(rel));
    const out = [];
    for (const c of st.chronicle) if (hit(c.summary)) out.push({ kind: 'summary', fromTurn: c.fromTurn, toTurn: c.toTurn, text: c.summary });
    const turns = st.log.filter(e => e.narration);
    const firstAt = turns.findIndex(e => hit(e.narration));
    if (firstAt < 0 && !out.length) return [];
    // The latest few lines from before they were named that speak of someone's kin: the model is told they may be about someone else.
    const before = (firstAt > 0 ? turns.slice(0, firstAt) : []).filter(e => KIN_RE.test(e.narration)).slice(-CONTEXT_MENTIONS);
    const named = [];
    for (const e of turns) if (hit(e.narration)) named.push({ kind: 'turn', turn: e.turn, day: e.day, phase: e.phase, text: e.narration });
    const keep = out.concat(named).slice(-(MENTIONS - before.length));
    const summaries = keep.filter(m => m.kind === 'summary');
    return summaries.concat(before.map(e => ({ kind: 'turn', turn: e.turn, day: e.day, phase: e.phase, text: e.narration, context: true })), keep.filter(m => m.kind !== 'summary'));
  }
  /* The packet for Api.fixPeople: structured (the mock reads people and
     everyone) and as labelled text (the model reads text). */
  function peoplePacket(st, list) {
    const everyone = st.npcs.filter(n => n.alive !== false).map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, role: n.role }));
    const people = list.map(({ n, mentions }) => {
      const c = isObj(n.created) ? n.created : {};
      return { npcId: n.id, name: n.name, pronouns: n.pronouns || null, role: n.role || '', look: n.look || '', voice: n.voice || '', relationToNpcId: c.relationToNpcId || null, relation: c.relation || null,
        homeLocationId: n.home ? n.home.locationId : null, by: madeBy(st, n), mentions };
    });
    const place = id => { const l = State.loc(id); return l ? `${l.id} (${l.name})` : id; };
    const blocks = people.map(p => [
      `PERSON ${p.npcId} (made by the game ${MADE_BY[p.by] || MADE_BY.tables})`,
      `  name: ${p.name}`,
      `  pronouns: ${p.pronouns ? pronounLabel(p.pronouns) : 'not set'}`,
      `  role: ${p.role || '(none)'}`,
      `  look: ${p.look || '(none)'}`,
      `  voice: ${p.voice || '(none)'}`,
      `  related to: ${p.relationToNpcId ? `${p.relation || 'related'} of ${p.relationToNpcId}` : 'nobody recorded'}`,
      `  home: ${p.homeLocationId ? place(p.homeLocationId) : 'none'}`,
      '  WHAT THE STORY SAYS (oldest first):',
      ...p.mentions.map(m => (m.kind === 'summary' ? `  SUMMARY of turns ${m.fromTurn} to ${m.toTurn}: ${m.text}` : `  TURN ${m.turn} (day ${m.day}, ${m.phase}${m.context ? '; from before they were named: about them, or about someone else' : ''}): ${m.text}`))
    ].join('\n'));
    const text = [
      `PLAYER: ${st.player.name}`,
      `PLACES (the places list): ${st.locations.map(l => `${l.id} — ${l.name} (${l.type})`).join('; ')}`,
      `PEOPLE (everyone in the game): ${everyone.map(x => `${x.id} — ${x.name} (${pronounLabel(x.pronouns)}; ${x.role})`).join('; ')}`,
      ''
    ].concat(blocks.join('\n\n')).join('\n');
    return { everyone, people, text };
  }
  /* "Mavis Toler is Dewayne's wife (she/her)". */
  function personLine(n) {
    const role = String(n.role || '').split(',')[0].trim();
    const what = relationOf(n) || (/^[A-Z][\w-]*['’]s\s/.test(role) ? role : `${article(role)} ${lowerFirst(role)}`);
    return `${n.name} is ${what} (${pronounLabel(n.pronouns)})`;
  }
  async function matchStory(st, api) {
    const res = { calls: 0, fixed: [], filled: [], reply: null };
    const same = 'People already match the story.';
    // Pronouns for anyone still without them, by the load rule, through the engine.
    const probe = { meta: st.meta, npcs: st.npcs.map(n => (validPronouns(n.pronouns) ? n : { id: n.id, role: n.role, look: n.look })) };
    State.fillPronouns(probe, State.town);
    const fill = probe.npcs.filter((x, i) => x !== st.npcs[i]).map(x => ({ npcId: x.id, pronouns: x.pronouns }));
    if (fill.length) {
      const r = State.apply({ fixPeople: fill });
      if (r.rejected.length) throw new Error('the engine refused the pronouns: ' + r.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
      res.filled = fill.map(x => x.npcId);
    }
    const filledText = res.filled.length ? ` Gave ${res.filled.length} ${res.filled.length === 1 ? 'person' : 'people'} pronouns.` : '';
    const list = madeUp(st).map(n => ({ n, mentions: mentionsOf(st, n) })).filter(x => x.mentions.length);
    if (!list.length) return Object.assign(res, { text: same + filledText });
    const reply = await api.fixPeople(peoplePacket(st, list));
    res.calls = 1;
    if (Api.isRefusal(reply)) throw Object.assign(new Error('refused'), { refused: true, refusal: reply });
    if (State.current !== st) throw Object.assign(new Error('another game was loaded'), { replaced: true });
    res.reply = isObj(reply) ? deepCopy(reply) : reply;
    const asked = new Set(list.map(x => x.n.id));
    const byId = new Map();
    for (const p of isObj(reply) && Array.isArray(reply.people) ? reply.people : []) {
      if (!isObj(p) || typeof p.npcId !== 'string' || byId.has(p.npcId)) continue;
      if (!asked.has(p.npcId)) { note(st, `people: the reply named ${p.npcId}, who was not asked about; ignored`); continue; }
      byId.set(p.npcId, p);
    }
    const fixes = [];
    for (const { n } of list) {
      const r = byId.get(n.id);
      if (!r) { note(st, `people: ${n.id} was missing from the reply; kept as they were`); continue; }
      const c = isObj(n.created) ? n.created : {};
      const f = { npcId: n.id, by: madeBy(st, n) };
      const str = (v, max) => cleanText(typeof v === 'string' ? v : '', max);
      if (str(r.name, 60) && str(r.name, 60) !== n.name) f.name = str(r.name, 60);
      if (validPronouns(r.pronouns) && r.pronouns !== n.pronouns) f.pronouns = r.pronouns;
      for (const [k, max] of [['role', 60], ['look', 200], ['voice', 200]]) if (str(r[k], max) && str(r[k], max) !== n[k]) f[k] = str(r[k], max);
      const relTo = typeof r.relationToNpcId === 'string' && r.relationToNpcId !== n.id ? State.npc(r.relationToNpcId) : null;
      if (r.relationToNpcId && !relTo) note(st, `people: ${n.id}: relationToNpcId ${r.relationToNpcId} is not someone in the game; ignored`);
      if (relTo && (relTo.id !== c.relationToNpcId || State.cleanRelation(r.relation) !== c.relation)) { f.relationToNpcId = relTo.id; f.relation = r.relation || null; }
      const home = typeof r.homeLocationId === 'string' ? State.loc(r.homeLocationId) : null;
      if (r.homeLocationId && !home) note(st, `people: ${n.id}: homeLocationId ${r.homeLocationId} is not a place; ignored`);
      if (home && !(n.home && n.home.locationId === home.id)) f.homeLocationId = home.id;
      if (Object.keys(f).length > 2) fixes.push(f);
    }
    if (fixes.length) {
      const r = State.apply({ fixPeople: fixes });
      for (const x of r.rejected) note(st, `people: not fixed (${x.path}): ${x.reason}`);
      const bad = new Set(r.rejected.map(x => +(/\[(\d+)\]/.exec(x.path) || [0, -1])[1]));
      res.fixed = fixes.filter((f, i) => !bad.has(i)).map(f => f.npcId);
    }
    if (!res.fixed.length) return Object.assign(res, { text: same + filledText });
    const lines = res.fixed.map(id => personLine(State.npc(id)));
    res.text = `Fixed ${res.fixed.length} ${res.fixed.length === 1 ? 'person' : 'people'} to match the story: ${lines.join('; ')}.${filledText}`;
    return res;
  }

  // ----- version 6: a full cast -----
  /* The town data a game's cast comes from: TOWN_DATA for a game of the
     built-in town, else the game's own copy (a town with its own cast). */
  function castData(st) {
    if (st.meta.townName === TOWN_DATA.name) return TOWN_DATA;
    return State.town && Array.isArray(State.town.npcs) && Array.isArray(State.town.locations) ? State.town : null;
  }
  const ROLE_STOP = new Set(['with', 'from', 'that', 'this', 'their', 'there', 'town', 'works', 'work', 'runs', 'keeps', 'lives', 'after', 'about', 'before', 'school', 'everyone', 'somebody', 'someone', 'townsfolk']);
  function roleWords(n) {
    return String(n.role || '').toLowerCase().replace(/[’‘]/g, "'").replace(/'s\b/g, ' ').replace(/[^a-z -]+/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !ROLE_STOP.has(w)).concat((n.tags || []).map(t => String(t).toLowerCase()));
  }
  function firstOf(n) { return String(State.firstName(n) || '').toLowerCase(); }
  const sameRel = (a, b) => !!a && !!b && (a === b || genderWord(a, 'she') === genderWord(b, 'she'));
  /* The cast member a made-up person was: the one who is that relation to
     the person their record names ("Dewayne's wife" is Mavis), else the one
     their name is (State.samePerson: "Mavis" and "Mavis Mangum"), else the
     one with their first name and a role that shares a word with theirs.
     Or null. */
  function castMatch(m, cast) {
    const c = isObj(m.created) ? m.created : {};
    if (c.relationToNpcId && c.relation) {
      const owner = State.npc(c.relationToNpcId);
      const tie = owner ? State.tiesOf(owner).has.find(x => cast.has(x.id) && x.id !== m.id && sameRel(State.cleanRelation(x.relation || ''), State.cleanRelation(c.relation))) : null;
      if (tie) return { id: tie.id, by: 'relation' };
    }
    const people = Array.from(cast).map(id => State.npc(id)).filter(n => n && n.id !== m.id);
    if (!m.unnamed) {
      const named = people.filter(n => State.samePerson(n.name, m.name));
      if (named.length === 1) return { id: named[0].id, by: 'name' };
      const mine = new Set(roleWords(m));
      const both = people.filter(n => firstOf(n) === firstOf(m) && roleWords(n).some(w => mine.has(w)));
      if (both.length === 1) return { id: both[0].id, by: 'first name and role' };
    }
    return null;
  }
  /* "Mavis Mangum (Dewayne's wife)": the name, and who they are to someone
     (else the first part of the role). */
  function castTag(n) {
    const rel = State.relationNote(n) || tieTag(n);
    const role = rel || String(n.role || '').split(',')[0].trim();
    return role ? `${n.name} (${role})` : n.name;
  }
  function tieTag(n) {
    const t = State.tiesOf(n).isTo.find(x => FAMILY_RELATIONS.includes(x.relation));
    return t ? State.relationPhrase(State.npc(t.id), t.relation) : '';
  }
  /* Version 6, "A full cast": every person is written by hand and the game
     never makes one in play. A game from before gains every cast member and
     home it lacks by id (addCast: as a new game has them, homes
     undiscovered), and its people made up in play are folded onto the cast:
     one who already holds a cast id is recast in place (recastPeople: the
     cast's record, their own memories, attitude and meetings); a home
     someone told the player about that the cast has written is folded into
     it (mergePlaces, "Dewayne's house is the Mangum House"); anyone else
     made up is merged onto the cast member they were (castMatch,
     mergePeople), keeping their memories, attitude, meetings and every
     reference; the schedules the cast gives are filled in wherever someone
     is nowhere (castSchedules), and the game is marked castFixed. A made-up
     person nobody matches is kept and named in the summary, for the player
     to edit or remove. Deterministic: no call, mock or real. */
  async function fullCast(st) {
    const res = { added: { places: [], people: [] }, recast: [], places: [], merged: [], kept: [], calls: 0 };
    const T = castData(st);
    const first = st.meta.castFixed !== true;
    const run = (diff, what) => {
      const r = State.apply(diff);
      if (r.rejected.length) note(st, `cast: ${what}: ` + r.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
      return r;
    };
    if (T) {
      const beforeLocs = new Set(st.locations.map(l => l.id));
      const beforeNpcs = new Set(st.npcs.map(n => n.id));
      run({ addCast: { town: T } }, 'adding the cast');
      res.added.places = st.locations.filter(l => !beforeLocs.has(l.id)).map(l => l.id);
      res.added.people = st.npcs.filter(n => !beforeNpcs.has(n.id)).map(n => n.id);
      const castSet = new Set(T.npcs.map(n => n.id).filter(id => State.npc(id)));
      // Made up in play under an id the cast now has: the cast's record, their own history.
      const recast = st.npcs.filter(n => castSet.has(n.id) && isObj(n.created) && n.created.by !== 'edit').map(n => ({ npcId: n.id, was: n.name }));
      if (recast.length) { run({ recastPeople: recast.map(x => ({ npcId: x.npcId })) }, 'recasting'); res.recast = recast.filter(x => State.npc(x.npcId) && !isObj(State.npc(x.npcId).created)); }
      // Who each made-up person was.
      const pairs = [];
      for (const m of madeUp(st)) {
        if (castSet.has(m.id)) continue;
        const hit = castMatch(m, castSet);
        if (hit) pairs.push({ fromId: m.id, intoId: hit.id, by: hit.by, from: m.name });
      }
      const into = id => (pairs.find(x => x.fromId === id) || {}).intoId || id;
      // Homes someone told the player about that the cast has written (by owner, or by name).
      const homes = T.locations.filter(l => l.discovered === false);
      const places = [];
      for (const l of st.locations) {
        if (!isObj(l.revealed) || T.locations.some(x => x.id === l.id)) continue;
        const owner = l.revealed.ownerNpcId ? T.npcs.find(n => n.id === into(l.revealed.ownerNpcId)) : null;
        let target = owner && l.revealed.kind === 'home' && typeof owner.home === 'string' ? owner.home : null;
        if (!target) {
          const want = State.placeNames(l.name);
          const named = homes.find(h => [h.name, h.map && h.map.label].some(k => k && [...State.placeNames(k)].some(x => want.has(x))));
          target = named ? named.id : null;
        }
        if (target && target !== l.id && State.loc(target)) places.push({ fromId: l.id, intoId: target, from: l.name });
      }
      if (places.length) { run({ mergePlaces: places.map(x => ({ fromId: x.fromId, intoId: x.intoId })) }, 'folding told homes'); res.places = places.filter(x => !State.loc(x.fromId)); }
      if (pairs.length) {
        const r = run({ mergePeople: pairs.map(x => ({ fromId: x.fromId, intoId: x.intoId })) }, 'merging people');
        const done = new Set((r.merged || []).map(x => x.fromId));
        res.merged = pairs.filter(x => done.has(x.fromId));
      }
      // The cast's schedules: everywhere on a first update; on a re-read, only for who and where is new.
      const fresh = new Set(res.added.people.concat(res.recast.map(x => x.npcId)));
      const freshPlaces = new Set(res.added.places);
      const entries = [];
      for (const l of T.locations) for (const ph of PHASES) for (const id of ((l.npcIdsBySchedule || {})[ph] || [])) {
        if (first || fresh.has(id) || freshPlaces.has(l.id)) entries.push({ locationId: l.id, phase: ph, npcId: id });
      }
      if (entries.length) run({ castSchedules: entries }, 'schedules');
    }
    run({ castFixed: true }, 'fixing the cast');
    res.kept = madeUp(st).filter(n => !(T && T.npcs.some(x => x.id === n.id)));
    const parts = [];
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    if (res.added.people.length || res.added.places.length) parts.push(`Added the rest of the town's cast, written by hand: ${n(res.added.people.length, 'person', 'people')} and ${n(res.added.places.filter(id => (State.loc(id) || {}).discovered === false && (State.loc(id) || {}).away !== true).length, 'home', 'homes')} to find.`);
    for (const x of res.recast) parts.push(`${x.was} is now ${castTag(State.npc(x.npcId))}.`);
    for (const x of res.places) parts.push(`${x.from} is ${String((State.loc(x.intoId) || {}).name || x.intoId).replace(/^The /, 'the ')}.`);
    for (const x of res.merged) { const into = State.npc(x.intoId); parts.push(`${x.from} is now ${into && into.name === x.from ? "the cast's " : ''}${castTag(into)}.`); }
    if (res.kept.length) parts.push(`Kept ${n(res.kept.length, 'person', 'people')} the game made up who ${res.kept.length === 1 ? 'is' : 'are'} not in the cast: ${joinNames(res.kept.map(k => k.name))}. Edit or remove ${res.kept.length === 1 ? 'them' : 'them'} on the People tab.`);
    res.kept = res.kept.map(k => k.id);
    res.text = parts.length ? parts.join(' ') : 'The cast is complete.';
    return res;
  }

  // ----- version 7: a lived-in town -----
  /* Version 7, "A lived-in town": the owner's direction of 29 Oct 2026
     ("add everything in the database like locations, all the characters,
     even if only mentioned by name ... make the world lived in"). Every
     person the town's story names is a record now, the dead and the far
     away included (presence here, away or dead), everyone has an age and
     a history, every place has details, hours and a history, the places
     out of town exist (away: never a destination), and the player has an
     age. An older game gains the records it lacks (addCast: a game from
     before version 6 got them with the cast), then everything its records
     lack is filled from the town data and nothing it has is overwritten
     (State livedIn), the player's age from their background. Deterministic:
     no call, mock or real. */
  async function livedInTown(st) {
    const res = { added: { people: [], places: [] }, filled: null, calls: 0 };
    const T = castData(st);
    const run = (diff, what) => {
      const r = State.apply(diff);
      if (r.rejected.length) note(st, `lived in: ${what}: ` + r.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
      return r;
    };
    if (T) {
      const beforeLocs = new Set(st.locations.map(l => l.id));
      const beforeNpcs = new Set(st.npcs.map(n => n.id));
      run({ addCast: { town: T } }, 'adding the people and places the story names');
      res.added.places = st.locations.filter(l => !beforeLocs.has(l.id)).map(l => l.id);
      res.added.people = st.npcs.filter(n => !beforeNpcs.has(n.id)).map(n => n.id);
      // Anyone new in town, or anyone scheduled at a new place, goes where the town data has them.
      const entries = [];
      for (const l of T.locations) for (const ph of PHASES) for (const id of ((l.npcIdsBySchedule || {})[ph] || [])) {
        if (res.added.people.includes(id) || res.added.places.includes(l.id)) entries.push({ locationId: l.id, phase: ph, npcId: id });
      }
      if (entries.length) run({ castSchedules: entries }, 'schedules');
    }
    res.filled = run({ livedIn: { town: T || { npcs: [], locations: [] } } }, 'filling in the town').livedIn || null;
    const parts = [];
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const ppl = res.added.people.map(id => State.npc(id)).filter(Boolean);
    const dead = ppl.filter(x => presenceOf(x) === 'dead').length;
    const away = ppl.filter(x => presenceOf(x) === 'away').length;
    const inTown = ppl.length - dead - away;
    const locs = res.added.places.map(id => State.loc(id)).filter(Boolean);
    const out = locs.filter(l => l.away === true).length;
    if (ppl.length || locs.length) {
      const who = [inTown ? `${inTown} in town` : '', dead ? `${dead} dead` : '', away ? `${away} living elsewhere` : ''].filter(Boolean).join(', ');
      const where = [locs.length - out ? `${locs.length - out} in town` : '', out ? `${out} out of town` : ''].filter(Boolean).join(', ');
      const bits = [ppl.length ? `${n(ppl.length, 'person', 'people')} the story names (${who})` : '', locs.length ? `${n(locs.length, 'place', 'places')} (${where})` : ''].filter(Boolean);
      parts.push(`Added ${bits.join(' and ')}.`);
    }
    const f = res.filled;
    if (f && (f.ages || f.histories || f.places)) {
      const bits = [];
      if (f.ages || f.histories) bits.push(`the ${f.ages && f.histories ? 'ages and histories' : f.ages ? 'ages' : 'histories'} of ${n(Math.max(f.ages, f.histories), 'person', 'people')}`);
      if (f.places) bits.push(`the history, details and hours of ${n(f.places, 'place', 'places')}`);
      parts.push(`Filled in ${bits.join(' and ')}.`);
    }
    if (f && f.playerAge !== null) parts.push(`${st.player.name} is ${f.playerAge}, the age a ${String(st.player.background || 'newcomer').toLowerCase()} starts at.`);
    res.text = parts.length ? parts.join(' ') : 'The town is already lived in.';
    return res;
  }

  const MIGRATIONS = Object.freeze([
    Object.freeze({ version: 2, title: 'Memories that matter', rerun: true, run: rewriteMemories }),
    Object.freeze({ version: 3, title: 'Places people told you about', rerun: true, run: revealPlaces }),
    Object.freeze({ version: 4, title: 'Clock follows the story', rerun: true, run: followStory }),
    Object.freeze({ version: 5, title: 'People match the story', rerun: true, run: matchStory }),
    Object.freeze({ version: 6, title: 'A full cast', rerun: true, run: fullCast }),
    Object.freeze({ version: 7, title: 'A lived-in town', rerun: true, run: livedInTown })
  ]);
  return { MIGRATIONS, PROTECTED, PER_PERSON, CHUNK, CLOCK_ENTRIES, MENTIONS, NOTICES, isProtected, behind, pending, candidates, chunks, memoryPacket, cleanReply, placesPacket, clockPacket, peoplePacket, madeUp, mentionsOf, castMatch, castData };
})();

