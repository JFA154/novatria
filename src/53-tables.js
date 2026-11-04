// ===== Module: Tables =====
/* Builds entities from TABLES with the seeded Rng. Nothing here writes state:
   callers pass the result to State.apply (addLocations, itemsGained). There
   is no person maker: every person is written by hand in TOWN_DATA and the
   game never invents one (the word lists a made-up person was rolled from
   are gone; TABLES.npc keeps the first names and jobs the person matcher
   reads). */
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
  function item(kind, rng) {
    const r = rng || Rng;
    if (kind === 'trinket') {
      const name = capFirst(r.pick(TABLES.items.trinkets));
      return { id: 'item_' + slugify(name), name, qty: 1, notes: 'trinket', price: 0 };
    }
    const g = r.pick(TABLES.items.goods);
    return { id: 'item_' + slugify(g.name), name: g.name, qty: 1, notes: '', price: price(g.name) };
  }
  /* A listed price times State.priceFactor(): the town's multiplier
     (flags.priceMultiplier) and the player's own while it lasts (the
     playerPrice op). */
  function price(name) {
    const g = TABLES.items.goods.find(x => x.name.toLowerCase() === String(name).toLowerCase());
    if (!g) return null;
    return Math.max(1, Math.round(g.price * State.priceFactor()));
  }
  /* One TABLES.complications entry, picked with no regard to the action
     (Dice.complication picks one that fits). */
  function complication(rng) { return (rng || Rng).pick(TABLES.complications); }
  function weather(season, rng) {
    const list = TABLES.weather[season] || TABLES.weather.spring || [];
    return (rng || Rng).pick(list) || '';
  }
  return { location, item, price, complication, weather };
})();

