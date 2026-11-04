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
   exactly as they are) goes to the parser model in one structured-output
   call (split by person past CHUNK memories), which returns each person's
   kept lines as { from: [numbers], text, weight }. A line keeps the earliest
   turn of the memories it came from, is cut like a bookkeeper memory
   (State.shortMemory) and a person keeps at most PER_PERSON; the result
   replaces their memories through State.apply({ setMemories }).

   Version 3, "Places people told you about": the bookkeeper now turns a
   specific place someone names into a real place (placesRevealed). An older
   game's story may already hold such a line. The whole log (each turn's
   input and narration) and the chronicle summaries, labelled as summaries,
   go to the parser model in one structured-output call (Api.revealPlaces,
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
   at) go to the parser model in one structured-output call (Api.checkClock,
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
   phrase, goes to the parser model in one structured-output call
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
   It is deterministic: no call, in mock mode or with the API.

   Version 8, "An arc" (rules for the calendar, town events, an ending,
   obligations, news, bans): an older game's copy of the town gains the
   calendar, the events and the epilogue, its rumours their tellers and
   threads, its threads their rewards (only what it lacks: nothing it has,
   a town of its own or an edited one, is overwritten); the state gains
   the news, obligations, bans and fired-events lists and the instant
   count; a loose end whose seed has not fired yet gets the obligation its
   option now carries (one that already fired gets none: its moment is
   past), and a grudge or favour seed not fired yet gets the effects of the
   template it was written from. Deterministic: no call.

   Version 9, "People who remember" (wave 30, docs/RELATIONSHIPS_PLAN.md
   section 6): every memory an older game holds gets the kind of thing it
   was and how long it lasts (the engine's own lines first,
   LEGACY_ENGINE_TEXTS, so the repo man's "took the phone" is never the
   player's theft; then the kind of turn, the words, the sense), fitted so
   how much each person likes the player is exactly the old attitude
   (State's relFill refuses anything else); trust is seeded from the old
   attitude for anyone with a serious good memory, anyone at 50 or more
   still opens their secret, knows-you comes from the lines and the days
   since meeting, favours owed from help still unsettled, spark 0. The
   informant's hold on the player becomes a record, a rumour heard that
   is leverage too; an open loose-end obligation or seed still to come
   with the old effects does what the loose end does now, and the council
   and the ending still to come read trust (the built-in town only).
   Deterministic and quiet, no call (unless Settings' "Rewrite memories
   first" runs version 2's re-read before it): one feed line says what
   changed. A person already brought to 9 (rel.migrated) is skipped.

   Version 10, "A town that talks" (wave 31, docs/RELATIONSHIPS_PLAN.md
   section 6): people now have ties to each other, and what the player does
   to someone reaches the people close to them. An older game gets the ties
   a new one starts with (State's tiesFill: both sides of every relation,
   the town's own ties with its secrets, fellows of a faction; a tie the
   game already has is never overwritten) and nothing on its way: nothing
   that already happened is spread again. Deterministic and quiet, no call:
   "People now feel for each other: N ties between M people. What you do
   from now on reaches the people close to them."

   Each step stamps the rules version as it completes and has a snapshot
   of its own (Pipeline.updateGame), so a failure at one step keeps the
   steps before it. A save from a newer build than this one (newer) is
   never updated. */
const Upgrade = (() => {
  const PROTECTED = State.PROTECTED_MEMORIES;
  // A re-read never cuts what the rules allow: as many lines as a person may hold.
  const PER_PERSON = State.MEMORY_MAX;
  const CHUNK = 40;
  const SHORT_WORDS = 12;
  const NOTICES = {
    start: 'Updating this game to the latest rules...',
    refused: 'The model declined to re-read this game, so nothing was changed. You can keep playing it as it is.',
    failed: 'Nothing was changed; the game is as it was.',
    newer: 'This game was saved by a newer version of the game than this one, so it cannot be updated here. It plays as it is; open it in the newer version to keep everything it added.',
    kept: titles => `The step${titles.length === 1 ? '' : 's'} before it (${titles.join(', ')}) ${titles.length === 1 ? 'was' : 'were'} kept:`,
    refusedStep: title => `The model declined the step "${title}", so that step changed nothing.`,
    failedStep: title => `The step "${title}" changed nothing.`
  };
  const isProtected = State.protectedMemory;
  function behind(st) { return !!st && State.rulesVersion(st) < State.RULES_VERSION; }
  function newer(st) { return !!st && State.rulesVersion(st) > State.RULES_VERSION; }
  /* The steps this build knows (a step newer than State.RULES_VERSION waits
     until the engine is at that version). */
  function known() { return MIGRATIONS.filter(m => m.version <= State.RULES_VERSION); }
  function pending(st) {
    if (newer(st)) return [];
    const v = State.rulesVersion(st);
    const due = known().filter(m => m.version > v);
    return due.length ? due : known().filter(m => m.rerun);
  }
  function note(st, reason) { State.pushDebug({ turn: st ? st.meta.turn : 0, kind: 'upgrade', reason }); }
  const open = n => (n.memories || []).filter(m => !isProtected(m));
  /* A line that already follows the rules: short (SHORT_WORDS words, the
     bookkeeper's limit) and no longer than a memory may be. */
  function isShort(m) {
    const t = String((m && m.text) || '').trim();
    return t.length <= State.MEMORY_TEXT_MAX && t.split(/\s+/).filter(Boolean).length <= SHORT_WORDS;
  }

  // ----- version 2: memories that matter -----
  /* Everyone with at least one memory the rewrite may touch, in groups of
     about CHUNK memories (a person is never split). Someone whose lines are
     all short already and within PER_PERSON is left alone: there is nothing
     to rewrite and nothing the re-read may cut. */
  function candidates(st) { return st.npcs.filter(n => open(n).length > 0 && !(open(n).every(isShort) && open(n).length <= PER_PERSON)); }
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
     turn (and the newest day) of the memories a line came from, the text cut like a bookkeeper
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
      // The newest day of the memories it came from (wave 5, the fourth review's bug 6): drift reads it, so a rewrite does not make a fresh memory old.
      const days = src.map(m => m.day).filter(d => Number.isInteger(d) && d >= 1);
      if (days.length) line.day = Math.max(...days);
      // The kind of turn it was made in, when the memories it came from agree (wave 5, playtest Q3).
      if (src.every(m => m.act && m.act === src[0].act)) line.act = src[0].act;
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
    return Object.assign(res, { changed: true, from, to: { day, phase }, text: `Set the clock back to Day ${day} · ${capFirst(phase)}: the story had not reached ${from.phase}.` });
  }

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
    res.text = res.added.length ? `Added ${res.added.length} ${res.added.length === 1 ? 'place' : 'places'} people told you about: ${andList(res.added)}.` : none;
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
  // The same relation either way round ("wife" and "husband" are one tie): Town's, once it shares it.
  const sameRel = (a, b) => Town.sameRel(a, b);
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
    const t = State.tiesOf(n).isTo.find(x => familyWord(x.relation));
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
    if (res.kept.length) parts.push(`Kept ${n(res.kept.length, 'person', 'people')} the game made up who ${res.kept.length === 1 ? 'is' : 'are'} not in the cast: ${andList(res.kept.map(k => k.name))}. Edit or remove them on the People tab.`);
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

  // ----- version 8: an arc -----
  function seedDay(st, sd) {
    if (isObj(sd.trigger) && sd.trigger.type === 'day' && Number.isInteger(toInt(sd.trigger.value))) return toInt(sd.trigger.value);
    return Number.isInteger(sd.notBeforeDay) ? sd.notBeforeDay : st.time.day + 1;
  }
  /* Everything is written through State.apply: arcFill (the town copy, the
     rumours' and threads' fields, the lists, the seeds' effects) and the
     loose ends' onStart effects. */
  async function anArc(st) {
    const res = { town: [], rumours: 0, threads: 0, obligations: 0, feelings: 0, defaults: [], calls: 0 };
    const T = st.meta.townName === TOWN_DATA.name ? TOWN_DATA : null;
    const seeds = [];
    const starts = [];
    // A loose end still to come carries its obligation (Town.obligationFor, the builder a new game uses), due that many days after the day its seed was planned for; one that already fired gets none.
    for (const le of Array.isArray(st.player.looseEnds) ? st.player.looseEnds : []) {
      const sd = le && le.seedId ? st.seeds.find(x => x.id === le.seedId) : null;
      // Its words as the loose end's kind now has them (wave 5: "draws you aside", not "finds you alone").
      const def = le && LOOSE_ENDS[le.kind];
      const n = sd ? st.npcs.find(x => x.id === le.npcId) : null;
      const words = sd && !sd.fired && def && isObj(def.seed) && typeof def.seed.effect === 'string' && n ? fillTemplate(def.seed.effect, { npc: n.name, player: st.player.name, text: cleanText(le.text, 200) }) : null;
      if (words && words !== sd.effect) seeds.push({ seedId: sd.id, effect: words });
      if (!sd || sd.fired || (Array.isArray(sd.effects) && sd.effects.length)) continue;
      const ob = Town.obligationFor(le);
      if (!ob) continue;
      const eff = Object.assign({}, ob.effect, { dueDay: seedDay(st, sd) + ob.effect.dueOffset });
      delete eff.dueOffset;
      seeds.push({ seedId: sd.id, effects: [eff], obligation: true });
      // What tying it gives the player now (the letter), unless they already carry it.
      starts.push(...ob.onStart.filter(e => !(e.op === 'giveItem' && st.player.inventory.some(i => String(i.name).toLowerCase() === String(e.name || '').toLowerCase()))));
    }
    // A grudge or favour still to come does what its template now does (matched by its words).
    for (const sd of st.seeds) {
      if (!sd || sd.fired || !isObj(sd.origin) || (sd.origin.kind !== 'grudge' && sd.origin.kind !== 'favour') || (Array.isArray(sd.effects) && sd.effects.length)) continue;
      const list = sd.origin.kind === 'grudge' ? GRUDGE_TEMPLATES : FAVOUR_TEMPLATES;
      const n = st.npcs.find(x => x.id === sd.origin.npcId);
      const t = (Array.isArray(list) ? list : []).find(x => isObj(x) && Array.isArray(x.effects) && x.effects.length && fillTemplate(x.effect, { npc: n ? n.name : '', player: st.player.name }) === sd.effect);
      if (t) seeds.push({ seedId: sd.id, effects: deepCopy(t.effects) });
    }
    const r = State.apply({ arcFill: { town: T, seeds: seeds.map(x => (x.effect ? { seedId: x.seedId, effect: x.effect } : { seedId: x.seedId, effects: x.effects })) } });
    if (r.rejected.length) note(st, 'an arc: ' + r.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
    const arc = r.arc || { town: [], rumours: 0, threads: 0, defaults: [], seeds: 0, plans: 0 };
    Object.assign(res, { town: arc.town, rumours: arc.rumours, threads: arc.threads, defaults: arc.defaults, plans: arc.plans | 0 });
    for (const x of seeds) {
      const sd = st.seeds.find(y => y.id === x.seedId);
      if (!sd || x.effect || JSON.stringify(sd.effects) !== JSON.stringify(x.effects)) continue;
      if (x.obligation) res.obligations += 1; else res.feelings += 1;
    }
    if (starts.length) {
      const r2 = State.apply({ effects: starts });
      if (r2.rejected.length) note(st, 'an arc: ' + r2.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
    }
    const parts = [];
    if (res.town.length) parts.push(`The town now has its ${res.town.map(k => ({ calendar: 'calendar', events: 'events', epilogue: 'ending' }[k] || k)).join(', ')}.`);
    if (res.rumours || res.threads) parts.push(`${res.rumours} rumour${res.rumours === 1 ? '' : 's'} and ${res.threads} thread${res.threads === 1 ? '' : 's'} filled in.`);
    if (res.obligations) parts.push(`${res.obligations} loose end${res.obligations === 1 ? '' : 's'} still to come now ${res.obligations === 1 ? 'carries an obligation' : 'carry obligations'}.`);
    if (res.feelings) parts.push(`${res.feelings} grudge or favour${res.feelings === 1 ? '' : 's'} still to come now ${res.feelings === 1 ? 'has' : 'have'} real effects.`);
    if (res.plans) parts.push(`${res.plans} of the town's plans now check the story before they happen.`);
    res.text = parts.length ? parts.join(' ') : 'The story already has its arc.';
    return res;
  }

  // ----- version 9: people who remember -----
  /* The engine's own memory lines in an older save (red-team item d): what
     the 56e69f5 writers and content templates wrote, tried before any
     typing by words, so an editor-stripped "took the phone" (the repo
     man's own act) is never typed as the player's theft. Each: { re, event,
     own (what they did to the player), scale (of the table's row), witness
     (a lighter copy), dNull (it moves nothing), noRecord (no leverage
     record after the fact), secondhand }. Earliest match wins. */
  const LEGACY_ENGINE_TEXTS = Object.freeze([
    { re: /^knocked me down in a fight at /i, event: 'beat_down' },
    { re: /^saw .+ knock .+ down at /i, event: 'beat_down', witness: true },
    { re: /^locked .+ up overnight for fighting/i, event: 'noted', own: true },
    { re: /^found .+ (still )?sleeping rough at /i, event: 'noted', own: true },
    { re: /^Found .+ beaten senseless and helped them/i, event: 'they_helped' },
    { re: /^Beat .+ in a fight and dragged them to the cells/i, event: 'noted', own: true },
    { re: /\blet the .+ go past due, so I took\b/i, event: 'broke_word', own: true },
    { re: /\bwould not pay, so I told Chief Bell\b/i, event: 'broke_word', own: true },
    { re: /\bwelshed on .+, and I made sure\b/i, event: 'broke_word', own: true },
    { re: /\blet it go past due: /i, event: 'broke_word' },
    { re: /\bpaid me two hundred dollars to keep quiet\b/i, event: 'paid_silence' },
    { re: /\bpaid (the )?.+ in full( and on time|, but late)|\bpaid the four hundred from the card game\b|\bpaid off the title-loan note\b|\bpaid me back \$/i, event: 'paid_back' },
    { re: /\bbrought me a letter\b|\bbrought my daughter home\b|\bcame around because my daddy asked\b|\bkept the promise\b/i, event: 'kept_word' },
    { re: /^waited for .+ and they never came/i, event: 'broke_word', scale: 0.5 },
    { re: /\bpromised to .+ and (never|has not)\b|\bmade me a promise and let the day go by\b/i, event: 'broke_word' },
    { re: /^caught .+ sneaking around/i, event: 'caught_you_at', noRecord: true },
    { re: /^caught .+ cheating at cards/i, event: 'cheated' },
    { re: /^(lost \$\d[\d,]* to|took a pot off) .+ at cards/i, event: 'noted', dNull: true },
    { re: /^Watched .+ fail badly/i, event: 'noted' },
    { re: /^Pointed .+ toward somebody in town who could help them|^Told .+ the old story about the river|^Put .+ against a wall and hit them twice/, event: 'noted', own: true },
    { re: /\bsays .+ was hanging around where things went missing|\breported .+ for putting hands on them/i, event: 'crossed', secondhand: true },
    { re: /\btold me what .+ is hiding\b/i, event: 'told_anyway', secondhand: true },
    { re: /\bvouched for .+ and said they were together all night\b/i, event: 'noted' },
    { re: /^Loose end with /i, event: 'noted' },
    { re: /^Fact \(a story point\):/i, event: 'noted' }
  ].map(x => Object.freeze(x)));
  /* What a loose end's obligation did in 56e69f5 (attitudeDelta and a
     legacy line, before wave 27 made them events), by kind: the default and
     each option's. An open obligation or a loose-end seed still to come
     whose effects are exactly these (filled for its person) does what its
     loose end does now. */
  function freezeAll(v) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) freezeAll(v[k]); }
    return v;
  }
  const OLD_OBLIGATIONS = freezeAll({
    debt: { obligation: {"onMiss":[{"op":"takeItem","name":"Prepaid phone"},{"op":"attitudeDelta","npcId":"{npcId}","delta":-15},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} let the four hundred go past due, so I took the phone as a start.","weight":3,"act":"own"},{"op":"addNews","text":"{npc} came looking for the four hundred dollars and took {playerName}'s phone as a start on it.","public":false}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} paid the four hundred in full and on time.","weight":2}]}, options: [{"onMiss":[{"op":"takeItem","name":"Prepaid phone"},{"op":"attitudeDelta","npcId":"{npcId}","delta":-15},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} let the six hundred go past due, so I took the phone as a start.","weight":3,"act":"own"},{"op":"addNews","text":"{npc} came looking for the six hundred dollars and took {playerName}'s phone as a down payment.","public":false}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} paid the six hundred in full and on time.","weight":2}]}, {"onMiss":[{"op":"obligationPaid","id":"{obligationId}","amount":150,"take":true},{"op":"takeItem","name":"Prepaid phone"},{"op":"attitudeDelta","npcId":"{npcId}","delta":-10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} let the title-loan note go past due, so I took what cash there was and the phone.","weight":3,"act":"own"},{"op":"addNews","text":"{npc} caught up with {playerName} about the title-loan note and took what cash there was, and the phone.","public":false}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} paid off the title-loan note, fees and all.","weight":2}]}, {"onMiss":[{"op":"banFrom","locationId":"loc_low_water","days":3,"byNpcId":"{npcId}"},{"op":"attitudeDelta","npcId":"{npcId}","delta":-20},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} welshed on four hundred dollars, and I made sure Loretta heard.","weight":3,"act":"own"},{"op":"addNews","text":"{npc} is telling everybody at the Low Water that {playerName} welshed on four hundred dollars, and Loretta Gaddis won't serve a welsher.","public":true}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} paid the four hundred from the card game, every dollar.","weight":2}]}] },
    secret: { obligation: {"onMiss":[{"op":"addMemory","npcId":"npc_marcus","text":"{npc} told me what {playerName} is hiding.","weight":2},{"op":"attitudeDelta","npcId":"npc_marcus","delta":-10},{"op":"attitudeDelta","npcId":"{npcId}","delta":-10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} would not pay, so I told Chief Bell what {playerName} is hiding.","weight":3,"act":"own"},{"op":"addNews","text":"{npc} has been telling people what {playerName} is hiding.","public":true}],"onMet":[{"op":"addMemory","npcId":"{npcId}","text":"{playerName} paid me two hundred dollars to keep quiet.","weight":2}]}, options: [null, null, null] },
    promise: { obligation: {"onMiss":[{"op":"attitudeDelta","npcId":"{npcId}","delta":-10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} made me a promise and let the day go by.","weight":2}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":10}]}, options: [{"onMiss":[{"op":"addMemory","npcId":"npc_bernice","text":"{playerName} promised to put my letter in my daughter's hand and never did.","weight":2},{"op":"addNews","text":"The letter for {npc} is still in {playerName}'s pocket.","public":false}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":15},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} brought me a letter from home.","weight":3}]}, {"onMiss":[{"op":"addMemory","npcId":"npc_dale","text":"{playerName} promised to look in on my boy and never wrote.","weight":2}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":10},{"op":"addMemory","npcId":"{npcId}","text":"{playerName} came around because my daddy asked them to.","weight":2}]}, {"onMiss":[{"op":"addMemory","npcId":"npc_bernice","text":"{playerName} promised to bring my daughter home and has not.","weight":2}],"onMet":[{"op":"attitudeDelta","npcId":"{npcId}","delta":10},{"op":"addMemory","npcId":"npc_bernice","text":"{playerName} brought my daughter home.","weight":3}]}] }
  });
  // The decay a line of this weight lasts at least (a serious old line outlasts a passing word).
  const WEIGHT_DECAY = Object.freeze({ 1: 'mood', 2: 'slight', 3: 'wound' });
  const DECAY_RANK = Object.freeze({ mood: 1, slight: 2, wound: 3, scar: 4, keeps: 5 });
  function fillAll(v, vars) {
    if (typeof v === 'string') return fillTemplate(v, vars);
    if (Array.isArray(v)) return v.map(x => fillAll(x, vars));
    if (isObj(v)) return Object.fromEntries(Object.keys(v).map(k => [k, fillAll(v[k], vars)]));
    return v;
  }
  /* The kind of thing an older line was (integration plan 13.1 steps 3 and
     4): the engine's own words first (LEGACY_ENGINE_TEXTS), then the kind
     of turn it was made in (an attack, a theft, a threat; what they did to
     the player), then its words (Rel.typeMemory), then its sense (a
     grievance is crossed, a kindness a compliment). The text is read with
     the player's name taken out, so a name never decides it. Returns {
     event, own, scale, witness, dNull, noRecord, secondhand, by }. */
  function legacyType(m, player) {
    const text = String(m.text || '');
    const hit = LEGACY_ENGINE_TEXTS.find(x => x.re.test(text));
    if (hit) return Object.assign({ by: 'engine' }, hit, { re: undefined });
    if (m.act === 'own') return { event: 'noted', own: true, by: 'act' };
    const t = text.toLowerCase();
    if (m.act === 'attack') return { event: /\b(beat|beaten|knock\w* (me )?(down|out))\b/.test(t) ? 'beat_down' : /\bshov\w*/.test(t) ? 'shoved' : 'hit', by: 'act' };
    if (m.act === 'steal') return { event: 'stole_from', by: 'act' };
    if (m.act === 'intimidate') return { event: 'threatened', by: 'act' };
    // "called me a liar" is the player's insult, not a lie of theirs caught.
    if (/\bcalled (me|us)\b/.test(t)) return { event: 'insulted', by: 'words' };
    const words = Rel.typeMemory({ text: player ? text.split(player).join('the player') : text, weight: m.weight });
    if (words !== 'noted') return { event: words, by: 'words' };
    const sense = Pipeline.memorySense(text);
    return sense < 0 ? { event: 'crossed', by: 'sense' } : sense > 0 ? { event: 'complimented', by: 'sense' } : { event: 'noted', by: 'none' };
  }
  /* A person's start as the town wrote them (the save's town copy, else the
     live cast, else the record), with a loose end's liking, trust and
     knows-you in it (they knew the player before). */
  function startFor(st, n) {
    const copy = State.town && Array.isArray(State.town.npcs) ? State.town.npcs.find(x => isObj(x) && x.id === n.id) : null;
    const live = st.meta.townName === TOWN_DATA.name ? TOWN_DATA.npcs.find(x => x.id === n.id) : null;
    const start = Rel.startOf(n, copy || live || n);
    const les = (st.player.looseEnds || []).filter(le => isObj(le) && le.npcId === n.id);
    for (const le of les) {
      start.w = clamp(start.w + (Town.LOOSE_END_ATTITUDE[le.kind] || 0), -100, 100);
      start.t = clamp(start.t + (Town.LOOSE_END_TRUST[le.kind] || 0), -100, 100);
      start.k = Math.max(start.k, 30);
    }
    return { start, loose: les.length > 0 };
  }
  // The day someone was met (metTurn read against the log), else day 1.
  function metDay(st, n) {
    if (!Number.isInteger(n.metTurn)) return null;
    const d = Rel.memoryDay({ turn: n.metTurn }, st);
    return Number.isInteger(d) ? d : 1;
  }
  /* One person, as version 9 makes them (integration plan 13.1 steps 2 to
     10): { rel, memories, typed (lines given a kind), owed } or null when
     nothing is to be done. Liking is exactly their attitude now. */
  function rememberPerson(st, n) {
    const D = st.time.day;
    const ctx = { s: st, town: State.town, day: D, turn: st.meta.turn };
    const A = clamp(toInt(n.attitude) || 0, -100, 100);
    const { start, loose } = startFor(st, n);
    const rel = deepCopy(Rel.repair(n, null));
    rel.start = start;
    rel.everyday = Object.assign({}, rel.everyday, { w: 0, s: 0, m: 0 });
    rel.fix = Object.assign({}, rel.fix, { w: 0, s: 0, m: 0 });
    rel.migrated = 9;
    const player = st.player.name;
    const kept = [];
    const fresh = [];
    const memories = [];
    let typed = 0;
    let goodSerious = false;
    const owed = [];
    for (const m0 of Array.isArray(n.memories) ? n.memories : []) {
      if (!isObj(m0)) continue;
      const m = deepCopy(m0);
      memories.push(m);
      if (isObj(m.d) && Rel.EVENTS[m.event]) { kept.push(m); if (m.weight >= 2 && !Rel.harmful(m)) goodSerious = true; continue; }
      const t = legacyType(m, player);
      const row = Rel.EVENTS[t.event] || Rel.EVENTS.noted;
      m.event = Rel.EVENTS[t.event] ? t.event : 'noted';
      if (!Number.isInteger(m.day)) { const d = Rel.memoryDay(m, st); m.day = Number.isInteger(d) ? d : Math.max(1, D - 7); }
      if (t.own) m.act = 'own';
      if (t.witness) { m.witness = true; m.weight = Math.min(2, m.weight | 0 || 2); }
      if (t.secondhand) m.secondhand = true;
      const protectedLine = State.protectedMemory(m);
      // A line nothing could type (no engine words, no act, no sense) moves nothing and is no claim: d null.
      if (t.dNull || t.by === 'none') m.d = null;
      else {
        const w = t.witness && Rel.WITNESS[m.event] ? Rel.WITNESS[m.event] : row;
        const sc = Number.isFinite(t.scale) ? t.scale : 1;
        const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        m.d = protectedLine ? { w: 0, t: 0, f: 0, k: 0, s: 0 } : { w: num(w.w) * sc, t: num(w.t) * sc, f: num(w.f) * sc, k: t.witness ? 0 : num(row.k), s: 0 };
        const byWeight = WEIGHT_DECAY[clamp(m.weight | 0, 1, 3)];
        m.decay = (DECAY_RANK[byWeight] || 0) > (DECAY_RANK[row.decay] || 0) && row.decay !== 'keeps' ? byWeight : row.decay;
      }
      if (!m.key) m.key = `m${m.turn | 0}-${n.id}`;
      if (!protectedLine) typed += 1;
      if ((m.weight | 0) >= 2 && !t.own && ((isObj(m.d) && num0(m.d.w) + num0(m.d.t) > 0) || Pipeline.memorySense(m.text) > 0)) goodSerious = true;
      if (!t.own && ['did_favour', 'they_helped', 'rescued'].includes(m.event)) owed.push({ dir: Math.sign(Rel.EVENTS[m.event].owed), size: Math.abs(Rel.EVENTS[m.event].owed), key: m.key, day: m.day, turn: m.turn | 0, why: cleanText(m.text, 120) });
      fresh.push(m);
    }
    // The fit: what the new lines still carry on liking, scaled so the memories and start come to the old number (x0 to x2); signs that disagree: no liking, half the trust and fear.
    const ax = Rel.axesOf(n, ctx);
    const tmp = () => Object.assign({}, n, { rel, memories });
    const keptW = kept.reduce((a, m) => a + Rel.remainder(m, tmp(), D, ax, ctx).w, 0);
    const newW = fresh.reduce((a, m) => a + (isObj(m.d) ? Rel.remainder(m, tmp(), D, ax, ctx).w : 0), 0);
    const want = A - start.w - keptW;
    let scale;
    if (newW !== 0 && want !== 0 && Math.sign(newW) === Math.sign(want)) scale = clamp(want / newW, 0, 2);
    else scale = null;
    const two = x => Math.round(x * 100) / 100 || 0;
    for (const m of fresh) {
      if (!isObj(m.d)) continue;
      if (scale === null) m.d = { w: 0, t: two(m.d.t * 0.5), f: two(m.d.f * 0.5), k: m.d.k, s: 0 };
      else m.d = { w: two(m.d.w * scale), t: two(m.d.t * scale), f: two(m.d.f * scale), k: m.d.k, s: 0 };
    }
    // Owed favours from help still unsettled (rare in older saves).
    const have = new Set((rel.owed || []).map(o => o && o.key));
    rel.owed = (Array.isArray(rel.owed) ? rel.owed : []).concat(owed.filter(o => !have.has(o.key))).slice(-Rel.CAPS.owedEntries);
    // Liking exactly the old number (the rest into everyday, past its bound into fix).
    let next = Rel.landTo(tmp(), { w: A }, 'everyday', ctx);
    Object.assign(rel, next);
    // Trust seeded from the old attitude (a serious good memory: 0.8 of what they warmed, never past the liking), and the secret floor (the old gate: attitude 50).
    const now = Rel.raw(tmp(), D, ctx);
    const targets = {};
    const tNow = Math.round(now.t);
    let tWant = tNow;
    if (goodSerious) tWant = Math.min(tNow + Math.round(0.8 * Math.max(0, A - start.w)), Math.max(A, start.t, tNow));
    if (A >= 50) tWant = Math.max(tWant, Rel.GATES.secret.trust);
    if (tWant !== tNow) targets.t = clamp(tWant, -100, 100);
    // Knows-you: from the lines, meeting, the days since and a loose end (at most 60, never less than now).
    const met = metDay(st, n);
    const dk = memories.reduce((a, m) => a + (isObj(m.d) ? num0(m.d.k) : 0), 0);
    let kWant = clamp(Math.round(dk + (met ? 5 + 3 * Math.max(0, D - met) : 0) + (loose ? 30 : 0)), 0, 60);
    if (A >= 50) kWant = Math.max(kWant, Rel.GATES.secret.knows);
    kWant = Math.max(kWant, Math.round(now.k));
    if (kWant !== Math.round(now.k)) targets.k = kWant;
    if (Object.keys(targets).length) { next = Rel.landTo(tmp(), targets, { t: 'fix', k: 'everyday' }, ctx); Object.assign(rel, next); }
    // Liking once more, exactly (the trust and knows landing never moves it, but the fit is the promise).
    next = Rel.landTo(tmp(), { w: A }, 'everyday', ctx);
    Object.assign(rel, next);
    rel.migrated = 9;
    return { rel, memories, typed };
  }
  const num0 = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  /* Content copied into the save (step 12): an open loose-end obligation
     and a loose-end seed still to come whose effects are exactly the old
     ones do what the loose end does now; the council and the ending still
     to come read the tracks (the built-in town only; a town of the
     player's own is never touched); rumours carry leverageOver. */
  function contentFill(st) {
    const out = { obligations: [], seeds: [], branches: [], rumours: [] };
    const p = st.player;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const oldOf = (kind, at) => { const o = OLD_OBLIGATIONS[kind]; if (!o) return null; return at >= 0 && o.options[at] ? o.options[at] : o.obligation; };
    const newOf = (kind, at) => {
      const def = LOOSE_ENDS[kind];
      if (!def) return null;
      if (at < 0 && isObj(def.obligation)) return def.obligation;
      const i = at >= 0 ? at : 0;
      const opt = Array.isArray(def.options) ? def.options[i] : null;
      if (isObj(opt) && isObj(opt.obligation)) return opt.obligation;
      if (Array.isArray(def.obligations) && isObj(def.obligations[i])) return def.obligations[i];
      return isObj(def.obligation) ? def.obligation : null;
    };
    const optionText = o => (typeof o === 'string' ? o : isObj(o) ? o.text : '');
    for (const le of Array.isArray(p.looseEnds) ? p.looseEnds : []) {
      if (!isObj(le) || !OLD_OBLIGATIONS[le.kind]) continue;
      const n = st.npcs.find(x => x.id === le.npcId);
      if (!n) continue;
      const def = LOOSE_ENDS[le.kind];
      const at = (Array.isArray(def.options) ? def.options : []).findIndex(o => optionText(o) === cleanText(le.text, 200));
      const was = oldOf(le.kind, at);
      const now = newOf(le.kind, at);
      if (!was || !now) continue;
      const vars = { npc: n.name, npcId: n.id, player: p.name, playerName: p.name, text: cleanText(le.text, 200) };
      for (const o of (Array.isArray(p.obligations) ? p.obligations : []).filter(x => isObj(x) && x.status === 'open' && x.npcId === n.id)) {
      const ov = Object.assign({ obligationId: o.id }, vars);
        const fix = { id: o.id };
        if (same(o.onMiss, fillAll(was.onMiss, ov)) && !same(was.onMiss, now.onMiss || [])) fix.onMiss = fillAll(now.onMiss || [], ov);
        if (same(o.onMet, fillAll(was.onMet, ov)) && !same(was.onMet, now.onMet || [])) fix.onMet = fillAll(now.onMet || [], ov);
        if (fix.onMiss || fix.onMet) out.obligations.push(fix);
      }
      const sd = le.seedId ? st.seeds.find(x => isObj(x) && x.id === le.seedId) : null;
      if (sd && !sd.fired && Array.isArray(sd.effects)) {
        let changed = false;
        const effects = sd.effects.map(e => {
          if (!isObj(e) || e.op !== 'addObligation') return e;
          const f = Object.assign({}, e);
          if (same(e.onMiss, fillAll(was.onMiss, vars)) && !same(was.onMiss, now.onMiss || [])) { f.onMiss = fillAll(now.onMiss || [], vars); changed = true; }
          if (same(e.onMet, fillAll(was.onMet, vars)) && !same(was.onMet, now.onMet || [])) { f.onMet = fillAll(now.onMet || [], vars); changed = true; }
          return f;
        });
        if (changed) out.seeds.push({ seedId: sd.id, effects });
      }
    }
    if (st.meta.townName === TOWN_DATA.name && State.town && State.town !== TOWN_DATA) {
      const T = TOWN_DATA;
      const reads = w => isObj(w) && (isObj(w.relAtLeast) || isObj(w.relBelow));
      const fromOld = w => isObj(w) && isObj(w.attitudeAtLeast);
      const branches = (eventId, mine, theirs) => {
        if (!isObj(mine) || !isObj(theirs) || !Array.isArray(mine.branches) || !Array.isArray(theirs.branches)) return;
        mine.branches.forEach((b, i) => {
          const t = theirs.branches[i];
          if (isObj(b) && isObj(t) && b.text === t.text && fromOld(b.when) && reads(t.when) && !same(b.when, t.when)) out.branches.push({ eventId, index: i, when: deepCopy(t.when) });
        });
      };
      for (const ev of Array.isArray(State.town.events) ? State.town.events : []) if (isObj(ev) && !(Array.isArray(st.eventsFired) && st.eventsFired.includes(ev.id))) branches(ev.id, ev, (T.events || []).find(x => x.id === ev.id));
      if (!st.flags.epilogueShown) branches('epilogue', State.town.epilogue, T.epilogue);
      for (const r of Array.isArray(T.rumours) ? T.rumours : []) {
        if (typeof r.leverageOver !== 'string') continue;
        const mine = st.rumours.find(x => isObj(x) && x.id === r.id);
        const copy = Array.isArray(State.town.rumours) ? State.town.rumours.find(x => isObj(x) && x.id === r.id) : null;
        if ((mine && mine.leverageOver === undefined) || (copy && copy.leverageOver === undefined)) out.rumours.push({ id: r.id, leverageOver: r.leverageOver });
      }
    }
    return out;
  }
  /* Leverage the save already implies (step 11): each informant loose end's
     hold on the player as a record, its status read from the obligation
     (none yet: held, the player does not know of it; open: used; met:
     paid; missed: spent); a rumour heard that content marks as leverage
     over someone, the player's record (they do not know). Secrets shown in
     earlier packets: nothing (no record of them exists). */
  function leverageFill(st) {
    const records = [];
    const head = Rel.policeHead({ s: st, town: State.town });
    const opts = (LOOSE_ENDS.secret && Array.isArray(LOOSE_ENDS.secret.options) ? LOOSE_ENDS.secret.options : []).map(o => (typeof o === 'string' ? o : isObj(o) ? o.text : ''));
    for (const le of Array.isArray(st.player.looseEnds) ? st.player.looseEnds : []) {
      if (!isObj(le) || le.kind !== 'secret' || !st.npcs.some(n => n.id === le.npcId)) continue;
      if ((Array.isArray(st.leverage) ? st.leverage : []).some(x => isObj(x) && x.holder === le.npcId && x.over === 'player' && isObj(x.about) && x.about.kind === 'loose_end')) continue;
      const at = opts.indexOf(cleanText(le.text, 200));
      const o = (Array.isArray(st.player.obligations) ? st.player.obligations : []).filter(x => isObj(x) && x.npcId === le.npcId && x.kind === 'blackmail').pop();
      const status = !o ? 'held' : o.status === 'open' ? 'used' : o.status === 'met' ? 'paid' : o.status === 'missed' ? 'spent' : o.status === 'lapsed' ? 'void' : 'held';
      records.push(Object.assign({ holder: le.npcId, text: cleanText(le.text, 120), weight: at >= 0 ? Rel.LEVERAGE_WEIGHT.looseEnd[at] || 2 : 2, mattersTo: head ? [head] : [], status, playerKnows: !!o }, o ? { obligationId: o.id } : {}));
    }
    const live = st.meta.townName === TOWN_DATA.name ? (TOWN_DATA.rumours || []) : [];
    const heard = st.rumours.filter(r => isObj(r) && r.heard && r.true !== false && (typeof r.leverageOver === 'string' || live.some(x => x.id === r.id && typeof x.leverageOver === 'string'))).map(r => r.id);
    return { records, heard };
  }
  /* Version 9, "People who remember" (the integration plan's 13.1; no
     call): for each person not dead, every memory gets the kind of thing it
     was and how long it lasts, fitted so how much they like the player is
     exactly the old attitude (relFill refuses anything else); trust is
     seeded from the old attitude for anyone with a serious good memory,
     and anyone at 50 or more (the old gate for their secret) keeps it open;
     knows-you comes from the lines, meeting and the days since; favours
     owed from help still unsettled; spark 0. Someone already brought up to
     version 9 (rel.migrated) whose lines are all typed is skipped. The
     informant's hold on the player becomes a record; the content still to
     come is copied (contentFill). With Settings' "Rewrite memories in the
     short form first" (rereadMemories) on, version 2's re-read runs before
     it (the one call).
     All quiet: one feed line says what changed. */
  async function peopleRemember(st, api) {
    const res = { people: 0, typed: 0, records: 0, branches: 0, calls: 0 };
    let reread = false;
    try { reread = Storage.settings().rereadMemories === true; } catch (e) { reread = false; }
    if (reread) {
      const r = await rewriteMemories(st, api);
      res.calls += r.calls | 0;
      res.reread = r.text;
    }
    const behindNine = State.rulesVersion(st) < 9;
    const people = [];
    for (const n of st.npcs) {
      if (!isObj(n) || n.alive === false || presenceOf(n) === 'dead') continue;
      const mems = Array.isArray(n.memories) ? n.memories.filter(isObj) : [];
      const allTyped = mems.every(m => typeof m.event === 'string' && m.d !== undefined);
      if (isObj(n.rel) && n.rel.migrated === 9 && allTyped) continue;
      if (!behindNine && allTyped) continue;
      const p = rememberPerson(st, n);
      if (!p) continue;
      people.push({ npcId: n.id, rel: p.rel, memories: p.memories });
      if (p.typed) res.typed += 1;
    }
    const content = contentFill(st);
    const lev = leverageFill(st);
    const diff = { relFill: Object.assign({ people }, content, lev) };
    if (!people.length && !content.obligations.length && !content.seeds.length && !content.branches.length && !content.rumours.length && !lev.records.length && !lev.heard.length) return Object.assign(res, { text: (res.reread ? `${res.reread} ` : '') + 'People already remember why.' });
    const r = State.quietly(() => State.apply(diff));
    if (r.rejected.length) throw new Error('the engine refused it: ' + r.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
    const f = r.relFill || {};
    res.people = f.people | 0;
    res.records = (f.records | 0);
    res.branches = f.branches | 0;
    const count = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const parts = [];
    if (res.reread) parts.push(res.reread);
    if (res.typed) parts.push(`People now remember why: ${count(res.typed, "person's memories now carry", "people's memories now carry")} what they did to how they feel.`);
    const holding = (Array.isArray(st.leverage) ? st.leverage : []).filter(x => isObj(x) && x.over === 'player' && Rel.LEV_LIVE.includes(x.status)).length;
    if (res.records && holding) parts.push(`${count(holding, 'person has', 'people have')} something on you.`);
    if (res.branches) parts.push('The council now weighs trust.');
    if (!res.typed && !(res.records && holding) && !res.branches) parts.push('People already remember why.');
    res.text = parts.join(' ');
    return res;
  }
  /* Version 10, "A town that talks" (wave 31, the integration plan's 13.2;
     no call): the ties the town gives, made for the people in town
     (State's tiesFill: both sides of every relation and the town's own
     ties, fellows of a faction; never overwriting a tie the game has), and
     nothing on its way yet. Nothing that already happened is spread again.
     Quiet, rerun-safe; one feed line. */
  async function townTalks(st) {
    const r = State.quietly(() => State.apply({ tiesFill: true }));
    if (r.rejected.length) throw new Error('the engine refused it: ' + r.rejected.map(x => `${x.path}: ${x.reason}`).join('; '));
    const f = r.tiesFill || { added: 0, ties: 0, people: 0 };
    const text = f.added ? `People now feel for each other: ${f.ties} ${f.ties === 1 ? 'tie' : 'ties'} between ${f.people} people. What you do from now on reaches the people close to them.` : 'People already feel for each other.';
    return { text, ties: f.ties, people: f.people, added: f.added, calls: 0, state: st ? st.meta.turn : 0 };
  }

  const MIGRATIONS = Object.freeze([
    Object.freeze({ version: 2, title: 'Memories that matter', rerun: true, run: rewriteMemories }),
    Object.freeze({ version: 3, title: 'Places people told you about', rerun: true, run: revealPlaces }),
    Object.freeze({ version: 4, title: 'Clock follows the story', rerun: true, run: followStory }),
    Object.freeze({ version: 5, title: 'People match the story', rerun: true, run: matchStory }),
    Object.freeze({ version: 6, title: 'A full cast', rerun: true, run: fullCast }),
    Object.freeze({ version: 7, title: 'A lived-in town', rerun: true, run: livedInTown }),
    Object.freeze({ version: 8, title: 'An arc', rerun: true, run: anArc }),
    Object.freeze({ version: 9, title: 'People who remember', rerun: true, run: peopleRemember }),
    Object.freeze({ version: 10, title: 'A town that talks', rerun: true, run: townTalks })
  ]);
  return { MIGRATIONS, PROTECTED, PER_PERSON, CHUNK, CLOCK_ENTRIES, MENTIONS, NOTICES, isProtected, isShort, behind, newer, known, pending, candidates, chunks, memoryPacket, cleanReply, placesPacket, clockPacket, peoplePacket, madeUp, mentionsOf, castMatch, castData,
    // Wave 30: version 9.
    LEGACY_ENGINE_TEXTS, OLD_OBLIGATIONS, legacyType, rememberPerson, contentFill, leverageFill,
    // Wave 31: version 10.
    townTalks };
})();

