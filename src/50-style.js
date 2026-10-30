// ===== Module: Style =====
/* Banned-phrase and length checks (SPEC.md section 9) and the narrator's
   cached system prompt, in one of two styles (Settings.narrationStyle:
   casual, the default, or literary). Pipeline step 7 regenerates once with
   regenerationNote() when check() fails, and keeps the second try. */
const Style = (() => {
  const EXAMPLES_INTRO = 'EXAMPLES (from a different town; none of these people or places exist in this game):';
  const STYLES = {
    casual: { guide: STYLE_GUIDE_CASUAL, examples: EXAMPLE_TURNS_CASUAL },
    literary: { guide: STYLE_GUIDE_LITERARY, examples: EXAMPLE_TURNS_LITERARY }
  };
  const NAMES = Object.keys(STYLES);
  const DEFAULT = 'casual';
  // Both guides carry the same BANNED PHRASES line (SPEC section 9).
  const BANNED = (() => {
    const line = STYLE_GUIDE_LITERARY.split('\n').find(l => l.startsWith('BANNED PHRASES:')) || '';
    return Array.from(line.matchAll(/"([^"]+)"/g), m => m[1].toLowerCase());
  })();
  const WORD_LIMITS = { normal: 90, zoom: 150 };
  /* Casual only: a simile outside dialogue ("like a", "like an", "as if").
     Quoted speech is left out, so "I'd like a beer," she says passes. */
  const SIMILE = /\b(like an?|as if)\b/i;
  const prompts = {};
  function pick(style) { return NAMES.includes(style) ? style : DEFAULT; }
  /* The style in Settings now (an unknown value reads as casual). */
  function current() {
    let s = null;
    try { s = Storage.settings().narrationStyle; } catch (e) { s = null; }
    return pick(s);
  }
  /* Byte-identical every call for a given style so it caches
     (docs/API_NOTES.md): nothing volatile goes in here, only that style's
     guide and its example turns. Caches are per style and per model, so
     switching the style starts the cache cold once. */
  function systemPrompt(style) {
    const k = pick(style === undefined ? current() : style);
    if (prompts[k] === undefined) {
      const ex = STYLES[k].examples.map(t => `Input: ${t.input}\n(${t.context})\n${t.narration}`).join('\n\n');
      prompts[k] = `${STYLES[k].guide}\n\n${EXAMPLES_INTRO}\n\n${ex}`;
    }
    return prompts[k];
  }
  function unquoted(t) { return t.replace(/"[^"]*"|“[^”]*”?/g, ' '); }
  /* Spoken lines only, as 4-word phrases; a phrase of nothing but filler words
     does not count. Used to catch a person's verbal habit turning up again. */
  const FILLER = new Set(("i you he she it we they the a an to of in on and but or not is was are am do don't didn't what that this my your his her me him them up out for with at be have has had so if as no yes now then there here just like know say said says one all can can't get got go going come see well right ok okay oh hey man son sir ma'am hon you're i'm it's that's there's he's she's we're they're").split(' '));
  function spokenPhrases(t) {
    const out = new Set();
    const quotes = String(t || '').replace(/[‘’]/g, "'").match(/"[^"]*"|“[^”]*”/g) || [];
    for (const q of quotes) {
      const words = q.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
      for (let i = 0; i + 4 <= words.length; i++) {
        const gram = words.slice(i, i + 4);
        if (gram.some(w => !FILLER.has(w))) out.add(gram.join(' '));
      }
    }
    return out;
  }
  /* A quoted line that addresses the player ("you") and speaks of last
     night, yesterday, a while, or having met before: on day 1 there is no
     such past. Returns the phrase, or null. */
  const PAST_RE = /\b(last night|last week|last month|yesterday|the other day|the other night|known you|knew you|we've met|we have met|met you before|seen you before|you've been (?:here|around|in town)|you been (?:here|around|in town)|been (?:here|around) a while|known a while|for a while now|a while now|go way back|since you (?:came|got|showed up|turned up|rolled in)|the last time you|every time you)\b/i;
  function inventedPast(text) {
    const quotes = String(text || '').replace(/[‘’]/g, "'").match(/"[^"]*"|“[^”]*”/g) || [];
    for (const q of quotes) {
      if (!/\b(you|your|you're|you've|you'd|you'll)\b/i.test(q)) continue;
      const m = PAST_RE.exec(q);
      if (m) return m[1].toLowerCase();
    }
    return null;
  }
  function repeatedPhrase(text, previous) {
    const seen = new Set();
    for (const p of previous || []) for (const g of spokenPhrases(p)) seen.add(g);
    for (const g of spokenPhrases(text)) if (seen.has(g)) return g;
    return null;
  }
  /* opts: { zoom, style, previous } (style defaults to the current setting;
     previous: recent narrations, for the repeated-phrase check). */
  function check(text, opts) {
    const zoom = !!(opts && opts.zoom);
    const style = pick(opts && opts.style !== undefined ? opts.style : current());
    const t = String(text || '').replace(/[‘’]/g, "'");
    const lower = t.toLowerCase();
    const problems = [];
    for (const b of BANNED) if (lower.includes(b)) problems.push({ type: 'banned', detail: b });
    const words = wordCount(t);
    const limit = zoom ? WORD_LIMITS.zoom : WORD_LIMITS.normal;
    if (words > limit) problems.push({ type: 'length', detail: `${words} words, limit ${limit}`, words, limit });
    if (/what do you do/i.test(t)) problems.push({ type: 'question', detail: 'contains "What do you do"' });
    if (/^\s*["“]?as you\b/i.test(t)) problems.push({ type: 'opening', detail: 'starts with "As you"' });
    if (style === 'casual') {
      const m = SIMILE.exec(unquoted(t));
      if (m) problems.push({ type: 'simile', detail: `a simile ("${m[1].toLowerCase()}")` });
    }
    const again = opts && Array.isArray(opts.previous) && opts.previous.length ? repeatedPhrase(t, opts.previous) : null;
    if (again) problems.push({ type: 'repeat', detail: `repeats the spoken phrase "${again}" from an earlier turn`, phrase: again });
    // Day 1: nobody here had a past with the player, so a spoken line to them
    // about last night or a while ago invents one. Unless someone here does
    // know them (pastKnown: a loose end's person, who remembers the past
    // they share), in which case "I knew you'd show up" is theirs to say.
    if (opts && opts.day === 1 && !opts.pastKnown) {
      const past = inventedPast(t);
      if (past) problems.push({ type: 'past', detail: `on day 1, someone speaks to the player of a past that never happened ("${past}")`, phrase: past });
    }
    return { ok: problems.length === 0, problems, words, style };
  }
  /* Names each problem; a length problem names the word count and the limit
     and asks for a rewrite under it. */
  function regenerationNote(problems) {
    const what = problems.map(p => p.type === 'banned' ? `banned phrase "${p.detail}"` : p.detail).join('; ');
    const long = problems.find(p => p.type === 'length');
    const others = problems.some(p => p.type !== 'length');
    const plain = (problems.some(p => p.type === 'past') ? ' It is day 1: the player came to town today, nobody here knew them or heard of them before, and nothing about them happened last night or earlier. People know only what they have seen since the player arrived and what their remembers list says.' : '') + (problems.some(p => p.type === 'simile') ? ' Say it plainly, with no comparisons.' : '') + (problems.some(p => p.type === 'repeat') ? ' Give that person different words this time: no catchphrase, no story they already told, a plain answer is fine.' : '');
    const fix = long
      ? `Write it again${others ? ' without that,' : ''} in ${lengthRule(long.limit > WORD_LIMITS.normal)}: keep the action and its outcome, and cut scenery and bystanders first.${plain}`
      : `Write it again without that.${plain}`;
    return `STYLE CHECK FAILED on your last attempt: ${what}. ${fix}`;
  }
  /* The narrator packet's last line (Pipeline.narratorPacket) and the
     rewrite note share these numbers with check(). */
  function lengthRule(zoom) { return zoom ? `up to 6 sentences, under ${WORD_LIMITS.zoom} words` : `2 to 4 sentences, under ${WORD_LIMITS.normal} words`; }
  function lengthLine(zoom) { return `LENGTH: ${lengthRule(zoom)}. Stop at the first moment the player must respond.${zoom ? '' : ' Not everyone and everything listed needs a mention.'}\nVARIETY: do not repeat a phrase, opener, joke or verbal habit used in THIS SCENE; a person's habit shows at most once in a scene, and they can answer plainly.`; }
  return { BANNED, WORD_LIMITS, EXAMPLES_INTRO, STYLES: NAMES, DEFAULT, systemPrompt, current, check, regenerationNote, lengthLine, spokenPhrases, repeatedPhrase, inventedPast };
})();

