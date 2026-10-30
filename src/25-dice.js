// ===== Module: Dice =====
/* d20 + stat + modifiers (capped at +/-4) against a difficulty target.
   Tiers per SPEC.md section 7. The retry lock ("the same roll can't be
   retried immediately unless the situation changes"): every roll, whatever
   its outcome, stores the action's key in meta.lastRollKey and what the roll
   was in meta.lastRoll (lockRecord; both through State.apply). While the key
   holds (same place, phase, day, targets, item, stat and action type) a
   failed roll is not rolled again, and neither is an ask already granted:
   repeating it (askWords, sameAsk: mostly the same content words) gets "it
   is settled" with no roll and nothing gained. A clearly different ask
   rolls, and the asks granted in the same scene are kept beside the lock,
   so going back to one of them is still the same ask. Pipeline.resolve
   decides what each case gets; runTurn lifts the lock once the situation
   changes. */
const Dice = (() => {
  const TARGETS = { easy: 8, normal: 12, hard: 15, very_hard: 18 };
  const MOD_CAP = 4;
  const TIER_LABELS = { critical: 'Critical', success: 'Success', partial: 'Partial', failure: 'Failure', critical_failure: 'Critical failure' };
  const SOCIAL_ACTIONS = Object.freeze(['talk', 'persuade', 'deceive', 'intimidate', 'buy', 'sell', 'give']);

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
  function conditionAffects(c, stat, day) {
    if (!c) return false;
    if (Number.isInteger(c.untilDay) && c.untilDay < day) return false;
    const e = String(c.effect || '').toLowerCase();
    return e.includes(stat) || /\ball\b/.test(e);
  }
  /* Modifiers code applies: +2 fitting item held, +/-2 NPC attitude beyond
     +/-50 on social rolls, -1 per relevant condition. */
  function modifiersFor(state, opts) {
    const mods = [];
    if (!state) return mods;
    const p = state.player;
    const stat = opts.stat;
    if (opts.usesItemId && p.inventory.some(i => i.id === opts.usesItemId && i.qty > 0)) mods.push({ label: 'item', value: 2 });
    const social = opts.social === true || (opts.social !== false && (stat === 'charm' || SOCIAL_ACTIONS.includes(opts.actionType)));
    if (social && opts.npcId) {
      const n = state.npcs.find(x => x.id === opts.npcId);
      if (n && n.attitude > 50) mods.push({ label: 'attitude', value: 2 });
      else if (n && n.attitude < -50) mods.push({ label: 'attitude', value: -2 });
    }
    for (const c of p.conditions || []) if (conditionAffects(c, stat, state.time.day)) mods.push({ label: c.name, value: -1 });
    return mods;
  }
  function formatLine(r, withComplication) {
    const bonus = r.statValue + r.modifier;
    const name = capFirst(r.stat);
    const lhs = bonus === 0 ? `${name} ${r.d20}` : `${name} ${r.d20} ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)} = ${r.total}`;
    let line = `${lhs} vs ${r.target} · ${TIER_LABELS[r.tier]}`;
    if (withComplication && r.complication) line += ` · Complication: ${r.complication}`;
    return line;
  }
  /* opts: { stat, difficulty, usesItemId?, npcId?, actionType?, social?,
     modifiers? (override), statValue? (override), d20? (forced, for tests),
     complication? (forced) }. rng defaults to the state-bound Rng. */
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
    const complication = needsComplication(t) ? (opts.complication || Tables.complication(r)) : null;
    const res = { stat, statValue, modifiers, modifier, d20, total, target: tgt, difficulty, tier: t, label: TIER_LABELS[t], success: isSuccess(t), complication };
    res.line = formatLine(res, false);
    res.packetLine = formatLine(res, true);
    return res;
  }
  function lockKey(action, state) {
    state = state || State.current;
    const targets = (Array.isArray(action.targets) ? action.targets : []).map(String).sort().join(',');
    const where = state ? [state.player.locationId, state.time.day, state.time.phase] : [];
    return [action.actionType || 'other', action.stat || '', targets, action.usesItemId || ''].concat(where).join('|');
  }
  function isLocked(key, state) { state = state || State.current; return !!(state && key && state.meta.lastRollKey === key); }
  /* Every roll locks its key, whatever the outcome (SPEC section 7 never
     limits the rule to failures; locking only failures let a granted ask be
     asked again and again for more). */
  function lockFor(result, key) { return result && key ? key : null; }

  // ----- the ask: what the player asked for, as content words -----
  const LOCK_OUTCOMES = Object.freeze(['granted', 'failed']);
  const LOCK_GRANTED_MAX = 8;   // asks granted in one scene that the lock remembers
  const SAME_ASK_SHARE = 0.6;   // shared words, as a share of the shorter ask, that make it the same ask
  /* Words that ask for nothing: function words, fillers, contractions with
     the apostrophe dropped, and the verbs of asking (the action type is
     already in the key). */
  const ASK_STOP = new Set((
    'a an the and or but nor if so than then to of in on at by for from with without into onto about over under up down out off as ' +
    'until till since after before while because through around ' +
    'is are was were be been being am do does did done have has had will would can could should may might must shall ' +
    'i me my mine myself you your yours yourself he him his she her hers they them their theirs it its we us our ' +
    'this that these those there here what which who whom whose when where why how ' +
    'just really very too also again still please now some any all more much no not yes ok okay oh hey well ' +
    'come let lets get got gonna wanna want need ' +
    'im ive ill id youre youve youll youd dont doesnt didnt cant wont isnt arent wasnt thats theres whats ' +
    'ask asks asked asking persuade persuades persuading convince convinces convincing tell tells try tries trying ' +
    'attempt attempts beg begs say says talk talks once louder'
  ).split(/\s+/));
  function plainWords(text) { return String(text || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean); }
  /* The content words of an ask: lowercased, apostrophes dropped, a plural
     "s" taken off, stop words and the words of `skip` (the names of the
     people it is aimed at, already in the key) left out. Sorted, unique. */
  function askWords(text, skip) {
    const drop = new Set([].concat(skip || []).flatMap(plainWords));
    const out = new Set();
    for (let w of plainWords(text)) {
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
      if (!ASK_STOP.has(w) && !drop.has(w)) out.add(w);
    }
    return [...out].sort();
  }
  /* The same ask: one with no content words of its own ("Please?") adds
     nothing, so it is the same; otherwise at least SAME_ASK_SHARE of the
     shorter ask's words are in the other. */
  function sameAsk(was, now) {
    const a = Array.isArray(was) ? was : [];
    const b = Array.isArray(now) ? now : [];
    if (!b.length) return true;
    if (!a.length) return false;
    const seen = new Set(a);
    return b.filter(w => seen.has(w)).length / Math.min(a.length, b.length) >= SAME_ASK_SHARE;
  }
  function outcomeOf(t) { return isSuccess(t) ? 'granted' : 'failed'; }
  // The place, day and phase at the end of a key: the scene it was rolled in.
  function sceneOf(key) { return String(key || '').split('|').slice(-3).join('|'); }
  /* meta.lastRoll, as State keeps it: { key (meta.lastRollKey), outcome
     ('granted' | 'failed': the latest roll), line (its roll line), granted
     ([{ key, words, line }]: the asks granted in this scene since the lock
     was last lifted, oldest first) }, or null. */
  function cleanLock(v) {
    if (!isObj(v) || typeof v.key !== 'string' || !v.key || !LOCK_OUTCOMES.includes(v.outcome)) return null;
    const line = x => (typeof x === 'string' && x ? x.slice(0, 200) : null);
    const words = w => (Array.isArray(w) ? w.filter(x => typeof x === 'string' && x).map(x => x.slice(0, 40)).slice(0, 40) : []);
    const granted = (Array.isArray(v.granted) ? v.granted : []).filter(g => isObj(g) && typeof g.key === 'string' && g.key)
      .map(g => ({ key: g.key, words: words(g.words), line: line(g.line) }));
    return { key: v.key, outcome: v.outcome, line: line(v.line), granted: granted.slice(-LOCK_GRANTED_MAX) };
  }
  /* The record a roll leaves: its outcome and line, and the granted asks of
     the same scene carried over from the record before (prev), with this one
     added when it was granted. */
  function lockRecord(result, key, words, prev) {
    if (!result || !key) return null;
    const outcome = outcomeOf(result.tier);
    const p = cleanLock(prev);
    const kept = p ? p.granted.filter(g => sceneOf(g.key) === sceneOf(key)) : [];
    if (outcome === 'granted') kept.push({ key, words: Array.isArray(words) ? words.slice() : [], line: result.line || null });
    return { key, outcome, line: result.line || null, granted: kept.slice(-LOCK_GRANTED_MAX) };
  }
  /* The lock's record while it holds (meta.lastRollKey set, and the record
     its own), or null. */
  function lockState(state) {
    state = state || State.current;
    if (!state || !state.meta.lastRollKey) return null;
    const r = cleanLock(state.meta.lastRoll);
    return r && r.key === state.meta.lastRollKey ? r : null;
  }
  /* What the lock says about this key: 'failed' when it is locked and the
     latest roll on it failed (or the lock has no record: a save from before
     granted asks were locked, when only failures locked), 'granted' when it
     is locked after a granted roll, else null. */
  function lockedOutcome(key, state) {
    if (!isLocked(key, state)) return null;
    const r = lockState(state);
    return r ? r.outcome : 'failed';
  }
  /* An ask granted under this key in this scene that these words repeat
     ({ key, words, line }), or null. */
  function grantedAsk(key, words, state) {
    const r = lockState(state);
    if (!r || !key) return null;
    return r.granted.slice().reverse().find(g => g.key === key && sameAsk(g.words, words)) || null;
  }
  return { TARGETS, MOD_CAP, TIER_LABELS, SOCIAL_ACTIONS, LOCK_OUTCOMES, SAME_ASK_SHARE, target, capModifier, sumModifiers, tier, isSuccess, needsComplication, modifiersFor, resolve, formatLine,
    lockKey, isLocked, lockFor, askWords, sameAsk, outcomeOf, cleanLock, lockRecord, lockState, lockedOutcome, grantedAsk };
})();

