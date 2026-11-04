// ===== Module: Rng =====
/* mulberry32. Its state after n calls is seed + n * 0x6D2B79F5, so the stream
   is fully described by (meta.seed, meta.rngCalls): a loaded save continues
   exactly where it left off. The bound functions (Rng.int etc.) read and
   advance the live state's counter; Rng.create(seed) makes a free-standing
   generator for tests and previews. */
const Rng = (() => {
  const STEP = 0x6D2B79F5;
  function valueAt(seed, n) {
    const a = (seed + Math.imul(n + 1, STEP)) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function wrap(nextFn) {
    const g = {
      next: nextFn,
      int(a, b) {
        a = Math.ceil(a); b = Math.floor(b);
        if (b < a) { const t = a; a = b; b = t; }
        return a + Math.floor(nextFn() * (b - a + 1));
      },
      pick(arr) { return arr && arr.length ? arr[g.int(0, arr.length - 1)] : undefined; },
      d(sides) { return g.int(1, sides); }
    };
    return g;
  }
  let looseCalls = 0;
  const looseSeed = ((Date.now() >>> 0) ^ 0x9e3779b9) >>> 0;
  function nextBound() {
    const s = State.current;
    if (s && s.meta) {
      const m = s.meta;
      if (!Number.isInteger(m.rngCalls) || m.rngCalls < 0) m.rngCalls = 0;
      const v = valueAt(m.seed >>> 0, m.rngCalls);
      m.rngCalls += 1;
      return v;
    }
    return valueAt(looseSeed, looseCalls++);
  }
  const bound = wrap(nextBound);
  function create(seed, calls) {
    let n = Number.isInteger(calls) && calls > 0 ? calls : 0;
    const sd = seed >>> 0;
    const g = wrap(() => valueAt(sd, n++));
    Object.defineProperty(g, 'calls', { get: () => n });
    return g;
  }
  function newSeed() {
    try { const a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] || 1; }
    catch (e) { return (Date.now() >>> 0) || 1; }
  }
  return { next: bound.next, int: bound.int, pick: bound.pick, d: bound.d, create, newSeed, valueAt };
})();

