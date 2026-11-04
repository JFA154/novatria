// ===== Module: Dice =====
/* d20 + stat + modifiers (capped at +/-4) against a difficulty target.
   Tiers per SPEC.md section 7.

   The retry lock (SPEC section 7; docs/notes/engine-world.md).
   lockKey(action, ctx) is the action's family (FAMILIES: a persuade and a
   talk are the same ask, whatever stat the parser picked), its targets (for
   an action aimed at nothing in particular, its stat: climbing the wall is
   not picking the lock) and the item it uses, at this place, day and phase.
   A failed roll locks its key; the locked keys are a set kept in
   meta.lastRollKey (keys joined by ';', written through State.apply), so a
   second failure does not lift the first. A key
   carries its place and phase, so a move or a phase change lifts every
   lock even before clearLocks empties the set. An attack on someone still
   in front of the player has no key (null): a fight goes on. Pipeline asks
   isLocked(key) before rolling and stores lockFor(roll, key) after; lock
   and clearLocks({ move | phase }) are there for the turn lifecycle.

   Repeated asks. A social success is recorded in the same set as '+key':
   it locks nothing, but successes(key) counts how often the same ask
   (family and person) has already worked here this phase, and
   diminishing(n) is the share of an attitude gain the next one earns
   (1, 1/2, 1/4, then nothing). The pipeline scales the bookkeeper's
   positive attitude change for that person by it; asking again is never
   refused, so a second, different favour still plays.

   Fights: threat(npc) is the difficulty of fighting someone (police, armed
   or tough: hard; old, a teenager or frail: easy; else normal) and
   fightDamage(tier) what a fight roll costs the player (a partial 1, a
   failure 1 to 3, a fumble 3).

   Complications: complication(ctx) picks one from TABLES.complications
   that fits the action's kind, the tier (a partial's cost, a failure's
   twist), who is present (an entry that needs a person is only rolled with
   someone here, and names them as {witness}) and the day; it returns
   { text, effects, witnessId }. resolve() rolls one for a partial or a
   failure and puts the text on the roll (complication) and the effects
   (complicationEffects, placeholders filled) for the pipeline to apply. */
const Dice = (() => {
  const TARGETS = { easy: 8, normal: 12, hard: 15, very_hard: 18 };
  const MOD_CAP = 4;
  const TIER_LABELS = { critical: 'Critical', success: 'Success', partial: 'Partial', failure: 'Failure', critical_failure: 'Critical failure' };
  const SOCIAL_ACTIONS = Object.freeze(['talk', 'persuade', 'deceive', 'intimidate', 'buy', 'sell', 'give']);
  const FAMILIES = Object.freeze({
    talk: 'ask', persuade: 'ask', buy: 'deal', sell: 'deal', give: 'deal', deceive: 'lie', intimidate: 'threaten', attack: 'fight',
    sneak: 'sneak', steal: 'sneak', search: 'search', look: 'search', take: 'take', use: 'handle', other: 'handle', move: 'handle', rest: 'handle', wait: 'handle'
  });
  const SOCIAL_FAMILIES = Object.freeze(['ask', 'deal', 'lie', 'threaten']);
  const MAX_LOCKS = 12;
  const DIMINISHING = [1, 0.5, 0.25];
  /* What kind of complication fits an action (TABLES.complications kinds). */
  const COMPLICATION_KIND = Object.freeze({
    talk: 'social', persuade: 'social', deceive: 'social', intimidate: 'social', buy: 'social', sell: 'social', give: 'social',
    sneak: 'stealth', steal: 'stealth'
  });

  function target(difficulty) { return TARGETS[difficulty] || TARGETS.normal; }
  function capModifier(total) { return clamp(Math.round(Number(total) || 0), -MOD_CAP, MOD_CAP); }
  function sumModifiers(mods) {
    return capModifier((mods || []).reduce((sum, m) => sum + (typeof m === 'number' ? m : (Number(m && m.value) || 0)), 0));
  }
  function tier(d20, total, tgt) {
    if (d20 === 20) return 'critical';
    if (d20 === 1) return 'critical_failure';
    if (total >= tgt) return 'success';
    if (total >= tgt - 3) return 'partial';
    return 'failure';
  }
  function isSuccess(t) { return t === 'critical' || t === 'success' || t === 'partial'; }
  function needsComplication(t) { return t === 'partial' || t === 'failure' || t === 'critical_failure'; }
  /* A condition's modifier to a stat: its effect text
     is "<sign><n> <stat|all>[, ...]" ("-1 might", "+1 charm, -1 wits",
     "+2 might, feeling great"); every part naming this stat or all counts,
     with its sign and size. Text with no number counts nothing, and a stat
     name inside a word ("charming") is not a stat. 0 once it has run out. */
  const CONDITION_PART = /([+\-−–])\s*(\d+)\s*(?:to\s+)?(might|wits|charm|stealth|all)\b/gi;
  function conditionAffects(c, stat, day) {
    if (!c) return 0;
    if (Number.isInteger(c.untilDay) && Number.isInteger(day) && c.untilDay < day) return 0;
    let sum = 0;
    for (const m of String(c.effect || '').matchAll(CONDITION_PART)) {
      const which = m[3].toLowerCase();
      if (which !== 'all' && which !== stat) continue;
      sum += (m[1] === '+' ? 1 : -1) * parseInt(m[2], 10);
    }
    return sum;
  }
  /* Modifiers code applies: +2 fitting item held, the relationship's share
     on social rolls (wave 27, Rel.rollMod: liking +/-1 at 30 and +/-2 at 60
     for persuade, charm, talk, buy, sell and give; fear +1 at 20, +2 at 40,
     -1 against someone who likes the player at 40, for intimidate; a lie
     keeps +/-2 beyond +/-50 until wave 28), each condition's own modifier
     to the stat. */
  function modifiersFor(state, opts) {
    const mods = [];
    if (!state) return mods;
    const p = state.player;
    const stat = opts.stat;
    if (opts.usesItemId && p.inventory.some(i => i.id === opts.usesItemId && i.qty > 0)) mods.push({ label: 'item', value: 2 });
    const social = opts.social === true || (opts.social !== false && (stat === 'charm' || SOCIAL_ACTIONS.includes(opts.actionType)));
    if (social && opts.npcId) {
      const n = state.npcs.find(x => x.id === opts.npcId);
      const v = n ? Rel.rollMod(n, opts.actionType, { s: state }) : 0;
      if (v) mods.push({ label: opts.actionType === 'intimidate' ? 'fear' : 'attitude', value: v });
    }
    for (const c of p.conditions || []) { const v = conditionAffects(c, stat, state.time.day); if (v) mods.push({ label: c.name, value: v }); }
    return mods;
  }
  function formatLine(r, withComplication) {
    const bonus = r.statValue + r.modifier;
    const name = capFirst(r.stat);
    // One minus sign throughout (wave 6, the round-5 playtest's R9): "Might 1 − 2 = −1".
    const lhs = bonus === 0 ? `${name} ${r.d20}` : `${name} ${r.d20} ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)} = ${r.total < 0 ? '−' + Math.abs(r.total) : r.total}`;
    let line = `${lhs} vs ${r.target} · ${TIER_LABELS[r.tier]}`;
    if (withComplication && r.complication) line += ` · Complication: ${r.complication}`;
    return line;
  }

  // ----- complications -----
  function entryOf(x) {
    if (typeof x === 'string') return { text: x, tiers: ['both'], kinds: ['any'], needsPerson: false, notDay1: false, effects: [] };
    if (!isObj(x) || typeof x.text !== 'string') return null;
    return {
      text: x.text, tiers: Array.isArray(x.tiers) && x.tiers.length ? x.tiers : ['both'], kinds: Array.isArray(x.kinds) && x.kinds.length ? x.kinds : ['any'],
      needsPerson: x.needsPerson === true, notDay1: x.notDay1 === true, effects: Array.isArray(x.effects) ? x.effects : []
    };
  }
  /* ctx: { actionType, tier, presentIds, day, locationId, witnessId?
     (someone the action was aimed at: the witness when present),
     playerName? }. The table entries that fit, then one picked with rng
     (the state-bound Rng by default); a person it needs is the one the
     action was aimed at if present, else someone present picked the same
     way. Returns { text, effects, witnessId } (effects with "{witnessId}",
     "{witness}", "{playerName}" and "{place}" filled; an entry with
     nothing that fits falls back to one that needs nobody), or null when
     the table is empty. */
  function complication(ctx, rng) {
    ctx = ctx || {};
    const r = rng || Rng;
    const all = (Array.isArray(TABLES.complications) ? TABLES.complications : []).map(entryOf).filter(Boolean);
    if (!all.length) return null;
    const kind = COMPLICATION_KIND[ctx.actionType] || 'physical';
    const t = ctx.tier === 'partial' ? 'partial' : 'failure';
    const present = (Array.isArray(ctx.presentIds) ? ctx.presentIds : []).filter(id => typeof id === 'string');
    const day = Number.isInteger(ctx.day) ? ctx.day : 1;
    const tierFits = e => e.tiers.includes(t) || e.tiers.includes('both');
    const kindFits = e => e.kinds.includes(kind) || e.kinds.includes('any');
    const allowed = e => (!e.needsPerson || present.length > 0) && (!e.notDay1 || day > 1);
    let pool = all.filter(e => tierFits(e) && kindFits(e) && allowed(e));
    if (!pool.length) pool = all.filter(e => tierFits(e) && allowed(e) && !e.needsPerson);
    if (!pool.length) pool = all.filter(e => !e.needsPerson && !e.notDay1);
    if (!pool.length) pool = all;
    const e = r.pick(pool);
    let witnessId = null;
    if (e.needsPerson && present.length) witnessId = present.includes(ctx.witnessId) ? ctx.witnessId : r.pick(present);
    const s = State.current;
    const witness = witnessId && s ? State.npc(witnessId) : null;
    const place = ctx.locationId && s ? State.loc(ctx.locationId) : null;
    const vars = {
      // The place as said inside a sentence (wave 5): "after trouble at the Riverview Motor Court".
      witnessId, witness: witness ? witness.name : null, place: place ? String(place.name).replace(/^The /, 'the ') : null,
      playerName: ctx.playerName || (s ? s.player.name : null), player: ctx.playerName || (s ? s.player.name : null)
    };
    const text = fillTemplate(e.text, { witness: vars.witness || 'someone' });
    const effects = fillPlaceholders(e.effects, vars).map(ef => {
      // A rumour needs an id of its own: one made from the turn, never taken.
      if (ef.op !== 'addRumour' || !isObj(ef.rumour) || (typeof ef.rumour.id === 'string' && ID_RE.rum.test(ef.rumour.id))) return ef;
      const base = `rum_talk_${s ? s.meta.turn : 0}`;
      return Object.assign({}, ef, { rumour: Object.assign({}, ef.rumour, { id: uniqueId(base, id => !!(s && State.rumour(id))) }) });
    });
    return { text, effects, witnessId };
  }

  /* opts: { stat, difficulty, usesItemId?, npcId?, actionType?, social?,
     presentIds?, modifiers? (override), statValue? (override), d20?
     (forced, for tests), complication? (forced text; null or false: none,
     and none is rolled: the card game's) }. rng defaults to the
     state-bound Rng. */
  function resolve(opts, rng) {
    opts = opts || {};
    const r = rng || Rng;
    const state = opts.state === undefined ? State.current : opts.state;
    const stat = STATS.includes(opts.stat) ? opts.stat : 'wits';
    const difficulty = Object.prototype.hasOwnProperty.call(TARGETS, opts.difficulty) ? opts.difficulty : 'normal';
    const statValue = Number.isInteger(opts.statValue) ? opts.statValue : (state ? clamp(state.player.stats[stat] | 0, -1, 3) : 0);
    const modifiers = Array.isArray(opts.modifiers) ? opts.modifiers : modifiersFor(state, Object.assign({}, opts, { stat }));
    const modifier = sumModifiers(modifiers);
    const d20 = Number.isInteger(opts.d20) ? clamp(opts.d20, 1, 20) : r.d(20);
    const tgt = target(difficulty);
    const total = d20 + statValue + modifier;
    const t = tier(d20, total, tgt);
    let complicationText = null;
    let complicationEffects = [];
    const none = opts.complication === null || opts.complication === false;
    if (needsComplication(t) && !none) {
      if (opts.complication) complicationText = String(opts.complication);
      else {
        const where = state ? state.player.locationId : null;
        const presentIds = Array.isArray(opts.presentIds) ? opts.presentIds : (state && state === State.current && where ? State.npcsAt(where).map(n => n.id) : []);
        const c = complication({ actionType: opts.actionType, tier: t, presentIds, day: state ? state.time.day : 1, locationId: where, witnessId: opts.npcId }, r);
        if (c) { complicationText = c.text; complicationEffects = c.effects; }
      }
    }
    const res = { stat, statValue, modifiers, modifier, d20, total, target: tgt, difficulty, tier: t, label: TIER_LABELS[t], success: isSuccess(t), complication: complicationText, complicationEffects };
    res.line = formatLine(res, false);
    res.packetLine = formatLine(res, true);
    return res;
  }

  // ----- the retry lock -----
  /* ctx: { presentIds?, locationId?, day?, phase? } (defaults from the live
     state; the people present from State.npcsAt), or a game state. */
  function lockCtx(ctx) {
    const isState = !!(ctx && ctx.meta && ctx.player && ctx.time);
    const state = isState ? ctx : State.current;
    const o = !isState && isObj(ctx) ? ctx : {};
    const locationId = o.locationId || (state ? state.player.locationId : '');
    const day = Number.isInteger(o.day) ? o.day : state ? state.time.day : 0;
    const phase = o.phase || (state ? state.time.phase : '');
    const presentIds = Array.isArray(o.presentIds) ? o.presentIds : (state && state === State.current && locationId ? State.npcsAt(locationId).map(n => n.id) : []);
    return { locationId, day, phase, presentIds };
  }
  function family(actionType) { return FAMILIES[actionType] || 'handle'; }
  function lockKey(action, ctx) {
    if (!isObj(action)) return null;
    const c = lockCtx(ctx);
    const fam = family(action.actionType);
    const targets = (Array.isArray(action.targets) ? action.targets : []).map(String).sort();
    if (fam === 'fight' && targets.some(id => c.presentIds.includes(id))) return null;
    // Aimed at nothing in particular ("climb the wall", "pick the lock"): the stat is all that tells one try from another.
    const aim = targets.length || SOCIAL_FAMILIES.includes(fam) ? targets.join(',') : `~${STATS.includes(action.stat) ? action.stat : ''}`;
    // ';' separates the keys in meta.lastRollKey (lockSet): never inside one (a `new:` target may hold it; wave 3).
    return `${fam}|${aim}|${action.usesItemId || ''}@${c.locationId}|${c.day}|${c.phase}`.replace(/;/g, ',');
  }
  function scopeOf(key) { const k = String(key || '').replace(/^\+/, ''); const i = k.lastIndexOf('@'); return i >= 0 ? k.slice(i + 1) : null; }
  function scopeNow(state) {
    state = state || State.current;
    return state ? `${state.player.locationId}|${state.time.day}|${state.time.phase}` : null;
  }
  function lockSet(state) {
    state = state || State.current;
    const v = state && state.meta ? state.meta.lastRollKey : null;
    return typeof v === 'string' && v ? v.split(';').filter(Boolean) : [];
  }
  function isLocked(key, state) { return !!key && lockSet(state).includes(String(key).replace(/;/g, ',')); }
  /* The value meta.lastRollKey takes after this roll: the locks still in
     force here (this place and phase), plus the key when the roll failed,
     or plus '+key' when a social roll worked; null when nothing is left. */
  function lockFor(result, key, state) {
    key = key ? String(key).replace(/;/g, ',') : key;
    const now = scopeNow(state);
    const set = lockSet(state).filter(k => now !== null && scopeOf(k) === now);
    const t = result && result.tier;
    if (key && (t === 'failure' || t === 'critical_failure')) { if (!set.includes(key)) set.push(key); }
    else if (key && isSuccess(t) && SOCIAL_FAMILIES.includes(String(key).split('|')[0])) set.push('+' + key);
    const kept = set.slice(-MAX_LOCKS);
    return kept.length ? kept.join(';') : null;
  }
  /* Lift every lock: on a move or a phase change ({ move: true } or
     { phase: true }; both false does nothing), or always with no argument. */
  function clearLocks(why) {
    if (isObj(why) && Object.keys(why).length && !why.move && !why.phase && !why.all) return false;
    const s = State.current;
    if (!s || !s.meta.lastRollKey) return false;
    State.apply({ lastRollKey: null });
    return true;
  }
  /* How often the same social ask has already worked here this phase. */
  function successes(key, state) { return key ? lockSet(state).filter(k => k === '+' + String(key).replace(/;/g, ',')).length : 0; }
  function diminishing(n) { n = Math.max(0, n | 0); return n < DIMINISHING.length ? DIMINISHING[n] : 0; }

  // ----- fights -----
  const HARD_TAGS = ['police', 'armed', 'tough'];
  const EASY_TAGS = ['elderly', 'frail', 'teen', 'teenager', 'child'];
  function threat(npc) {
    if (!isObj(npc)) return 'normal';
    const tags = (Array.isArray(npc.tags) ? npc.tags : []).map(x => String(x).toLowerCase());
    const role = String(npc.role || '').toLowerCase();
    if (tags.some(x => HARD_TAGS.includes(x)) || /\b(police|officer|deputy|sheriff|trooper|bouncer)\b/.test(role)) return 'hard';
    const age = Number.isInteger(npc.age) ? npc.age : null;
    if (tags.some(x => EASY_TAGS.includes(x)) || (age !== null && (age >= 70 || age <= 17))) return 'easy';
    return 'normal';
  }
  function fightDamage(t, rng) {
    if (t === 'critical_failure') return 3;
    if (t === 'failure') return (rng || Rng).int(1, 3);
    if (t === 'partial') return 1;
    return 0;
  }
  /* A roll the rules skip (wave 27 on: someone afraid of the player does a
     small thing with no roll; a backed ask) still uses up its die, so the
     next real roll and the faction clocks land where they would have: a
     die a test or a cheat forced (Pipeline.hooks.nextD20 or nextTier) is
     taken and dropped, else one d20 is drawn from the stream (rng, the
     state's by default) and dropped. Returns the die, or null for a forced
     tier. Nothing calls it in wave 26. */
  function burn(rng) {
    const h = typeof Pipeline !== 'undefined' && Pipeline && isObj(Pipeline.hooks) ? Pipeline.hooks : null;
    if (h && (Number.isInteger(h.nextD20) || h.nextTier)) {
      const d = Number.isInteger(h.nextD20) ? h.nextD20 : null;
      h.nextD20 = null;
      h.nextTier = null;
      return d;
    }
    return (rng || Rng).d(20);
  }

  return {
    TARGETS, MOD_CAP, TIER_LABELS, SOCIAL_ACTIONS, FAMILIES, SOCIAL_FAMILIES, COMPLICATION_KIND,
    target, capModifier, sumModifiers, tier, isSuccess, needsComplication, conditionAffects, modifiersFor, resolve, formatLine, complication,
    family, lockKey, isLocked, lockFor, clearLocks, successes, diminishing, threat, fightDamage, burn
  };
})();

