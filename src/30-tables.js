// ===== Module: Tables =====
/* Builds entities from TABLES with the seeded Rng. Nothing here writes state:
   callers pass the result to State.apply (addNpcs, addLocations, itemsGained).
   npc(opts): pronouns are opts.pronouns, else what the role, the look or
   opts.noun says ("woman", "his wife"), else what the first name says, else
   they; a first name rolled for someone known to be she or he is one that
   fits (one draw either way, so the seeded stream stays in step). opts.noun
   is a plain word for the person ("woman") when the role is to be rolled:
   the look is built on it ("A woman with a bitter look about her.").
   opts.familyName replaces the rolled family name. */
const Tables = (() => {
  function taken(id) { return !!(State.current && State.entityById(id)); }
  function fits(first, p) { return p === 'she' ? !NAME_PRONOUNS.he.includes(first) : p === 'he' ? !NAME_PRONOUNS.she.includes(first) : true; }
  function npc(opts, rng) {
    opts = opts || {};
    const r = rng || Rng;
    const T = TABLES.npc;
    const noun = cleanText(opts.noun, 40);
    const said = inferPronouns([opts.role, opts.look, noun].filter(Boolean).join(' '));
    let pronouns = validPronouns(opts.pronouns) || (said !== 'they' ? said : null);
    let name = cleanText(opts.name, 60);
    if (!name) {
      const pool = pronouns ? T.firstNames.filter(f => fits(f, pronouns)) : T.firstNames;
      const first = r.pick(pool.length ? pool : T.firstNames);
      const family = r.pick(T.familyNames);
      // A wife or a child takes the family's name (opts.familyName); the draw is made either way.
      name = `${first} ${cleanText(opts.familyName, 30) || family}`;
    }
    if (!pronouns) pronouns = namePronouns(name) || 'they';
    const role = cleanText(opts.role, 60) || r.pick(T.occupations);
    const t1 = r.pick(T.traits);
    let t2 = r.pick(T.traits);
    for (let i = 0; i < 6 && t2 === t1 && T.traits.length > 1; i++) t2 = r.pick(T.traits);
    const voice = cleanText(opts.voice, 200) || r.pick(T.speechQuirks);
    const goal = cleanText(opts.goal, 200) || r.pick(T.wants);
    const isTaken = opts.taken || taken;
    const who = noun || role;
    return {
      id: uniqueId('npc_' + slugify(name), isTaken),
      name,
      pronouns,
      role,
      factionId: opts.factionId || null,
      tags: strArr(opts.tags),
      look: cleanText(opts.look, 200) || `${capFirst(article(who))} ${who} with ${article(t1)} ${t1} look about ${PRONOUN_OBJECT[pronouns]}.`,
      voice,
      personality: Array.isArray(opts.personality) && opts.personality.length ? strArr(opts.personality).slice(0, 3) : [t1, t2],
      goal,
      secret: cleanText(opts.secret, 300),
      attitude: clamp(toInt(opts.attitude) || 0, -100, 100),
      memories: [],
      alive: true,
      knownToPlayer: opts.knownToPlayer === true,
      status: 'free'
    };
  }
  function location(opts, rng) {
    opts = opts || {};
    const r = rng || Rng;
    const T = TABLES.location;
    const type = cleanText(opts.type, 40) || r.pick(T.types);
    const detail = r.pick(T.details);
    const problem = r.pick(T.problems);
    const name = cleanText(opts.name, 60) || capFirst(type);
    const isTaken = opts.taken || taken;
    return {
      id: uniqueId('loc_' + slugify(name), isTaken),
      name,
      type: type.toLowerCase(),
      description: `${sentence(`${capFirst(article(type))} ${type} with ${detail}`)} ${sentence(`Lately ${problem}`)}`,
      exits: opts.fromId ? [opts.fromId] : [],
      npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] },
      discovered: true,
      closed: false
    };
  }
  function item(kind, rng) {
    const r = rng || Rng;
    if (kind === 'trinket') {
      const name = capFirst(r.pick(TABLES.items.trinkets));
      return { id: 'item_' + slugify(name), name, qty: 1, notes: 'trinket', price: 0 };
    }
    const g = r.pick(TABLES.items.goods);
    return { id: 'item_' + slugify(g.name), name: g.name, qty: 1, notes: '', price: price(g.name) };
  }
  function price(name) {
    const g = TABLES.items.goods.find(x => x.name.toLowerCase() === String(name).toLowerCase());
    if (!g) return null;
    const m = (State.current && State.current.flags.priceMultiplier) || 1;
    return Math.max(1, Math.round(g.price * m));
  }
  function complication(rng) { return (rng || Rng).pick(TABLES.complications); }
  function weather(season, rng) {
    const list = TABLES.weather[season] || TABLES.weather.spring || [];
    return (rng || Rng).pick(list) || '';
  }
  return { npc, location, item, price, complication, weather };
})();

