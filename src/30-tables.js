// ===== Module: Tables =====
/* Builds from TABLES with the seeded Rng: a minor place made in play (step 4
   of the turn), a listed price, a complication, the weather. Nothing here
   writes state: callers pass the result to State.apply (addLocations).
   Nobody is made from the tables (direction change 8; the person generator
   went in direction change 17): TABLES.npc's first names and occupations are
   read by Town to tell a person in a description. */
const Tables = (() => {
  function taken(id) { return !!(State.current && State.entityById(id)); }
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
  return { location, price, complication, weather };
})();

