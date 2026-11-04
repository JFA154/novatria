// ===== Module: Cards =====
/* Five-card draw (wave 10; the owner: "Poker is so confusing with texts").
   A card is two characters, its rank (2-9, T, J, Q, K, A) and its suit
   (s, h, d, c): "Ks" is the king of spades, "Th" the ten of hearts.
   deck() is the 52 in order and shuffle(rng) a Fisher-Yates over them with
   the generator given (Pipeline.gamble seeds one per turn from the game's
   seed, so /undo and a replay deal the same hand). evaluate(hand) ranks
   five cards: { rank: 0 (high card) to 8 (straight flush), key: [rank,
   then the tie-break ranks, highest first], name: "Two pair, kings and
   sevens" }; compare(a, b) is above 0 when a wins, 0 for a split pot.
   dealerHolds(hand) is how the dealer draws: a straight or better stands
   pat; three of a kind, two pair and a pair keep the matched cards; then
   four to a flush, four to a straight, else the two highest. draw(hand,
   holds, pile) puts the pile's cards, in order, where the cards not held
   were. deal(rng, { stacked }) deals five to the player and five to the
   dealer, with each one's draw pile: the dealer's comes off the deck first,
   so his hand after the draw never hangs on the player's (the player's
   read can be about it at the deal). stacked (/cheat cards): the player is
   dealt a full house, the cards their draw would bring keep at least a
   pair whatever they hold, and the dealer draws to nothing. */
const Cards = (() => {
  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc';
  const WORD = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
  const SUIT_WORD = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
  // Each sign is followed by U+FE0E (text presentation), so a phone draws ♥ and ♦ in the card's own colour, never as emoji (wave 11, L12).
  const SUIT_SIGN = { s: '♠\uFE0E', h: '♥\uFE0E', d: '♦\uFE0E', c: '♣\uFE0E' };
  const RANK_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
  const ALL = [0, 1, 2, 3, 4];
  function valid(c) { return typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]); }
  function value(c) { return RANKS.indexOf(c[0]) + 2; }
  function suit(c) { return c[1]; }
  function red(c) { return suit(c) === 'h' || suit(c) === 'd'; }
  /* What a card shows: "10" for a ten, else its letter or digit; and its suit's sign. */
  function label(c) { return c[0] === 'T' ? '10' : c[0]; }
  function sign(c) { return SUIT_SIGN[suit(c)]; }
  function cardName(c) { return `${capFirst(WORD[value(c)])} of ${SUIT_WORD[suit(c)]}`; }
  function plural(v) { return v === 6 ? 'sixes' : `${WORD[v]}s`; }
  function deck() { const out = []; for (const s of SUITS) for (const r of RANKS) out.push(r + s); return out; }
  function shuffle(rng, cards) {
    const d = (cards || deck()).slice();
    for (let i = d.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }
  function nameOf(rank, r) {
    switch (rank) {
      case 0: return `${capFirst(WORD[r[0]])} high`;
      case 1: return `Pair of ${plural(r[0])}`;
      case 2: return `Two pair, ${plural(r[0])} and ${plural(r[1])}`;
      case 3: return `Three of a kind, ${plural(r[0])}`;
      case 4: return `Straight, ${WORD[r[0]]} high`;
      case 5: return `Flush, ${WORD[r[0]]} high`;
      case 6: return `Full house, ${plural(r[0])} over ${plural(r[1])}`;
      case 7: return `Four of a kind, ${plural(r[0])}`;
      default: return r[0] === 14 ? 'Royal flush' : `Straight flush, ${WORD[r[0]]} high`;
    }
  }
  function evaluate(hand) {
    const vals = hand.map(value).sort((a, b) => b - a);
    const counts = new Map();
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
    // By how many of a rank, then by rank: a full house's three first, a pair before its kickers.
    const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = hand.every(c => suit(c) === suit(hand[0]));
    let high = 0;
    if (groups.length === 5) {
      if (vals[0] - vals[4] === 4) high = vals[0];
      else if (vals[0] === 14 && vals[1] === 5) high = 5; // the wheel, ace to five: five high
    }
    const n = groups.map(g => g[1]);
    const rank = high && flush ? 8 : n[0] === 4 ? 7 : n[0] === 3 && n[1] === 2 ? 6 : flush ? 5 : high ? 4 : n[0] === 3 ? 3 : n[0] === 2 && n[1] === 2 ? 2 : n[0] === 2 ? 1 : 0;
    const ranks = high ? [high] : groups.map(g => g[0]);
    return { rank, key: [rank].concat(ranks), name: nameOf(rank, ranks) };
  }
  function compare(a, b) {
    const x = evaluate(a).key;
    const y = evaluate(b).key;
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  /* Four distinct ranks inside five in a row (an ace counts low too), the highest such run; null if none. */
  function fourToStraight(hand) {
    const vals = hand.map(value);
    for (let low = 10; low >= 1; low--) {
      const idx = ALL.filter(i => (vals[i] >= low && vals[i] <= low + 4) || (low === 1 && vals[i] === 14));
      if (idx.length === 4 && new Set(idx.map(i => vals[i])).size === 4) return idx;
    }
    return null;
  }
  function dealerHolds(hand) {
    const e = evaluate(hand);
    if (e.rank >= 4) return ALL.slice();
    const vals = hand.map(value);
    if (e.rank >= 1) return ALL.filter(i => vals.filter(v => v === vals[i]).length >= 2);
    for (const s of SUITS) { const idx = ALL.filter(i => suit(hand[i]) === s); if (idx.length === 4) return idx; }
    const run = fourToStraight(hand);
    if (run) return run;
    return ALL.slice().sort((a, b) => vals[b] - vals[a] || a - b).slice(0, 2).sort((a, b) => a - b);
  }
  /* Held positions as a sorted list of 0-4 (indices, or five true/false). */
  function holdsFrom(v) {
    if (v === 'all') return ALL.slice();
    const list = Array.isArray(v) ? (v.length === 5 && v.every(x => typeof x === 'boolean') ? ALL.filter(i => v[i]) : v) : [];
    return Array.from(new Set(list.filter(i => Number.isInteger(i) && i >= 0 && i < 5))).sort((a, b) => a - b);
  }
  function draw(hand, holds, pile) {
    const keep = holdsFrom(holds);
    let k = 0;
    return hand.map((c, i) => (keep.includes(i) ? c : pile[k++]));
  }
  /* Wave 13: extra seats (opts.seats, 0-3) get five cards and a draw pile
     each from the deck after the player's and the dealer's, so a heads-up
     deal is the same as before. */
  function deal(rng, opts) {
    const n = clamp(toInt(opts && opts.seats) || 0, 0, 3);
    if (opts && opts.stacked) { const st = stacked(rng, n); if (st) return st; }
    const d = shuffle(rng);
    const player = [];
    const dealer = [];
    for (let i = 0; i < 5; i++) { player.push(d[2 * i]); dealer.push(d[2 * i + 1]); }
    const seats = [];
    for (let k = 0; k < n; k++) seats.push({ hand: d.slice(20 + 10 * k, 25 + 10 * k), pile: d.slice(25 + 10 * k, 30 + 10 * k) });
    return { player, dealer, dealerPile: d.slice(10, 15), playerPile: d.slice(15, 20), seats };
  }
  /* The /cheat cards deck: a made hand for the player whose draw pile keeps
     at least a pair whatever they hold, and a dealer hand that draws to
     nothing. Wave 14 (QA #20): the hand varies with the seed: a full house
     (the fourth of the three and the other two of the pair next in the
     pile), a flush (the pile five more of the suit: any draw is still a
     flush) or a straight (the pile five cards of the straight's ranks: any
     draw is still the straight, or a pair). */
  function stackedPlayer(rng) {
    const shape = rng.int(0, 2);
    if (shape === 1) {
      const su = SUITS[rng.int(0, 3)];
      for (let t = 0; t < 40; t++) {
        const rs = shuffle(rng, RANKS.split('')).slice(0, 10);
        const player = rs.slice(0, 5).map(r => r + su);
        if (evaluate(player).rank !== 5) continue;
        const head = rs.slice(5, 10).map(r => r + su);
        return { player, head, used: c => player.includes(c) || head.includes(c) };
      }
    }
    if (shape === 2) {
      const low = rng.int(2, 10);
      const run = [0, 1, 2, 3, 4].map(k => RANKS[low - 2 + k]);
      for (let t = 0; t < 40; t++) {
        const player = shuffle(rng, run.map(r => r + SUITS[rng.int(0, 3)]));
        if (evaluate(player).rank !== 4) continue;
        const head = shuffle(rng, deck().filter(c => run.includes(c[0]) && !player.includes(c))).slice(0, 5);
        return { player, head, used: c => player.includes(c) || head.includes(c) };
      }
    }
    const ranks = shuffle(rng, RANKS.split(''));
    const tr = ranks[0];
    const pr = ranks[1];
    const ts = shuffle(rng, SUITS.split(''));
    const ps = shuffle(rng, SUITS.split(''));
    return { player: shuffle(rng, [tr + ts[0], tr + ts[1], tr + ts[2], pr + ps[0], pr + ps[1]]), head: [tr + ts[3], pr + ps[2], pr + ps[3]], used: c => c[0] === tr || c[0] === pr };
  }
  function stacked(rng, extra) {
    const { player, head, used } = stackedPlayer(rng);
    const rest = deck().filter(c => !used(c));
    // A hand that the dealer's rule draws to nothing, from the cards left (wave 13: one for each extra seat too).
    const nothing = pool => {
      for (let tries = 0; tries < 400; tries++) {
        const p = shuffle(rng, pool);
        if (evaluate(draw(p.slice(0, 5), dealerHolds(p.slice(0, 5)), p.slice(5, 10))).rank === 0) return p;
      }
      return null;
    };
    let pool = nothing(rest);
    if (!pool) return null;
    const fill = 5 - head.length;
    const out = { player, dealer: pool.slice(0, 5), dealerPile: pool.slice(5, 10), playerPile: head.concat(pool.slice(10, 10 + fill)), seats: [], stacked: true };
    pool = pool.slice(10 + fill);
    for (let k = 0; k < (extra | 0); k++) {
      const p = nothing(pool);
      if (!p) return null;
      out.seats.push({ hand: p.slice(0, 5), pile: p.slice(5, 10) });
      pool = p.slice(10);
    }
    return out;
  }

  // ----- Texas hold'em (wave 13) -----
  /* The owner: "Keep both and build holdem too". best(cards) is the best
     five of five to seven cards ({ cards, rank, key, name } as evaluate
     names it); compareKeys(x, y) is compare on two keys. holdem(rng, n)
     deals two cards to each of n seats, round the table from the first,
     then the board's five. holdemStacked(rng, n) (/cheat cards, /cheat win)
     gives the first seat the best hand at the table. Wave 14 (QA #20): its
     shape comes from the seed (a set, the nut flush, the top straight, a
     full house or four of a kind), and each other seat holds one of the
     best hands that still loses to it (a pair, two pair, a lower flush…),
     so a cheat hand looks like any other. namesApart(finals) names the
     hands shown at a showdown so that two that differ never share a name
     (QA #9). */
  function compareKeys(x, y) {
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  function best(cards) {
    const list = (cards || []).filter(valid);
    if (list.length <= 5) return Object.assign({ cards: list.slice() }, evaluate(list));
    let top = null;
    const n = list.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const five = list.filter((c, i) => i !== a && i !== b);
      if (five.length !== 5) continue;
      const e = evaluate(five);
      if (!top || compareKeys(e.key, top.key) > 0) top = Object.assign({ cards: five }, e);
    }
    // Six cards: leave one out (seven leave two, the pairs above).
    if (n === 6) for (let a = 0; a < n; a++) {
      const five = list.filter((c, i) => i !== a);
      const e = evaluate(five);
      if (!top || compareKeys(e.key, top.key) > 0) top = Object.assign({ cards: five }, e);
    }
    return top;
  }
  function holdem(rng, n) {
    const d = shuffle(rng);
    const holes = [];
    for (let i = 0; i < n; i++) holes.push([d[i], d[n + i]]);
    return { holes, board: d.slice(2 * n, 2 * n + 5), rest: d.slice(2 * n + 5) };
  }
  const STACK_SHAPES = Object.freeze(['set', 'flush', 'straight', 'full', 'quads']);
  const SHAPE_RANK = Object.freeze({ set: 3, straight: 4, flush: 5, full: 6, quads: 7 });
  /* The player's two and the five on the board for one shape (wave 14). */
  function stackShape(rng, shape) {
    const ranks = shuffle(rng, RANKS.split(''));
    const su = shuffle(rng, SUITS.split(''));
    // Board cards of the ranks given, with no suit three times on the board (nobody makes a flush there).
    const offBoard = (rs, pre) => {
      const count = {};
      for (const c of pre) count[c[1]] = (count[c[1]] || 0) + 1;
      return pre.concat(rs.map(r => { const x = shuffle(rng, SUITS.split('')).find(k => (count[k] || 0) < 2); count[x] = (count[x] || 0) + 1; return r + x; }));
    };
    if (shape === 'set') return { hole: [ranks[0] + su[0], ranks[0] + su[1]], board: offBoard(ranks.slice(1, 5), [ranks[0] + su[2]]) };
    if (shape === 'flush') {
      // The ace of the suit and one more; three of it on the board, two of other suits, no pair.
      const mine = ranks.filter(r => r !== 'A').slice(0, 4);
      const off = ranks.filter(r => r !== 'A' && !mine.includes(r)).slice(0, 2);
      return { hole: ['A' + su[0], mine[0] + su[0]], board: mine.slice(1).map(r => r + su[0]).concat(off.map((r, i) => r + su[1 + i])) };
    }
    if (shape === 'straight') {
      // The top two of a run (six-high to king-high); its low three on the board, never the card above it.
      const low = rng.int(2, 9);
      const run = [0, 1, 2, 3, 4].map(k => RANKS[low - 2 + k]);
      const off = ranks.filter(r => !run.includes(r) && r !== RANKS[low + 3]).slice(0, 2);
      return { hole: [run[3] + su[0], run[4] + su[1]], board: offBoard(run.slice(0, 3).concat(off), []) };
    }
    if (shape === 'full') {
      // A pocket pair over the board's pair: the higher rank in the hand.
      const [a, b] = ranks;
      const r = RANKS.indexOf(a) > RANKS.indexOf(b) ? a : b;
      const q = r === a ? b : a;
      const qs = shuffle(rng, SUITS.split(''));
      return { hole: [r + su[0], r + su[1]], board: [r + su[2], q + qs[0], q + qs[1]].concat(ranks.slice(2, 4).map((x, i) => x + su[i])) };
    }
    const r = ranks[0];
    const os = shuffle(rng, SUITS.split('')).slice(0, 3);
    return { hole: [r + su[0], r + su[1]], board: [r + su[2], r + su[3]].concat(ranks.slice(1, 4).map((x, i) => x + os[i])) };
  }
  /* Two cards for each other seat (wave 14): from a sample of what is left,
     one of the three best hands that still lose to the player's. null when
     a seat has none. Wave 15 (the QA's three "Straight, nine high" against
     one ten-high): each seat's hand differs from those already given when
     the sample allows, by its name (another shape, or other ranks) first,
     else by the cards that count. */
  function stackOthers(rng, hole, board, n) {
    const top = best(hole.concat(board)).key;
    let pool = deck().filter(c => !hole.includes(c) && !board.includes(c));
    const holes = [];
    const given = [];
    for (let i = 1; i < n; i++) {
      const loses = [];
      for (let t = 0; t < 120; t++) {
        const a = rng.int(0, pool.length - 1);
        let b = rng.int(0, pool.length - 2);
        if (b >= a) b++;
        const pair = [pool[a], pool[b]];
        const e = best(pair.concat(board));
        if (compareKeys(top, e.key) > 0) loses.push({ pair, k: e.key, name: e.name });
      }
      if (!loses.length) return null;
      loses.sort((x, y) => compareKeys(y.k, x.k));
      const named = loses.filter(x => given.every(g => g.name !== x.name));
      const apart = loses.filter(x => given.every(g => compareKeys(g.k, x.k) !== 0));
      const from = named.length ? named : apart.length ? apart : loses;
      const pick = from[rng.int(0, Math.min(2, from.length - 1))];
      holes.push(pick.pair);
      given.push(pick);
      pool = pool.filter(c => !pick.pair.includes(c));
    }
    return { holes, rest: shuffle(rng, pool) };
  }
  function holdemStacked(rng, n) {
    const shape = STACK_SHAPES[rng.int(0, STACK_SHAPES.length - 1)];
    for (let t = 0; t < 40; t++) {
      const made = stackShape(rng, shape);
      const seven = made.hole.concat(made.board);
      if (!seven.every(valid) || new Set(seven).size !== 7 || best(seven).rank !== SHAPE_RANK[shape]) continue;
      const others = stackOthers(rng, made.hole, made.board, n);
      if (others) return { holes: [made.hole].concat(others.holes), board: shuffle(rng, made.board), rest: others.rest, stacked: true, shape };
    }
    return quadsStacked(rng, n);
  }
  /* Four of a kind nobody can match or beat (wave 13; wave 14's fallback):
     a pocket pair whose other two are on a board with no other pair and no
     three of a suit. */
  function quadsStacked(rng, n) {
    const r = shuffle(rng, RANKS.split(''))[0];
    const ss = shuffle(rng, SUITS.split(''));
    const others = shuffle(rng, RANKS.split('').filter(x => x !== r)).slice(0, 3);
    // The three other board cards: three ranks and, with the two of r, no suit three times (so nobody makes a flush).
    const os = shuffle(rng, SUITS.split('')).slice(0, 3);
    const board = shuffle(rng, [r + ss[2], r + ss[3]].concat(others.map((x, i) => x + os[i])));
    const rest = shuffle(rng, deck().filter(c => c[0] !== r && !board.includes(c)));
    const holes = [[r + ss[0], r + ss[1]]];
    for (let i = 1; i < n; i++) holes.push([rest[2 * i - 2], rest[2 * i - 1]]);
    return { holes, board, rest: rest.slice(2 * n - 2), stacked: true, shape: 'quads' };
  }
  /* A hand's name with the cards that decide it against a hand of the same
     name (wave 14, QA #9): "Pair of aces, nine kicker"; a flush or a high
     card by its top cards, "Flush, ace-king high". upto: the last place in
     the hand's key that is named. Wave 15: the kickers are named from the
     first one to upto, so a name never reads as if a lower kicker were the
     top one ("Pair of aces, king-jack kickers"). */
  // Where a name's kickers start in the key: one pair and three of a kind after the rank, two pair after both pairs, four of a kind after the four.
  const KICKER_AT = Object.freeze({ 1: 2, 2: 3, 3: 2, 7: 2 });
  function nameUpTo(e, upto) {
    const k = e.key;
    if (!(upto > 1) || upto >= k.length) return e.name;
    if (e.rank === 0 || e.rank === 5) return `${e.rank === 5 ? 'Flush, ' : ''}${k.slice(1, upto + 1).map(v => WORD[v]).join('-')} high`.replace(/^[a-z]/, x => x.toUpperCase());
    const from = KICKER_AT[e.rank];
    if (!from || upto < from) return e.name;
    const named = k.slice(from, upto + 1).map(v => WORD[v]);
    return `${e.name}, ${named.join('-')} ${named.length > 1 ? 'kickers' : 'kicker'}`;
  }
  /* The names of the hands shown together (finals: five cards each, or
     null): two that differ never share a name, a name is only made longer
     where it has to be, and an exact tie keeps the one name. Wave 15: the
     hands of one name are named to one depth, the deepest place where any
     two of them that differ first differ, so their names line up ("king-jack
     kickers" / "king-ten kickers" / "nine-eight kickers"; "jack kicker" /
     "ten kicker" / "nine kicker" when the first kicker tells them all
     apart). */
  function namesApart(finals) {
    const evs = finals.map(f => (Array.isArray(f) && f.length === 5 ? evaluate(f) : null));
    const names = evs.map(e => (e ? e.name : null));
    const groups = new Map();
    evs.forEach((e, i) => { if (e) groups.set(e.name, (groups.get(e.name) || []).concat(i)); });
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      let depth = -1;
      for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) {
        const kx = evs[g[x]].key;
        const ky = evs[g[y]].key;
        let at = 1;
        while (at < kx.length && kx[at] === ky[at]) at++;
        if (at < kx.length && at > depth) depth = at;
      }
      if (depth < 0) continue;
      for (const i of g) names[i] = nameUpTo(evs[i], depth);
    }
    return names;
  }
  /* Two hole cards by name, before the flop: "Pair of jacks", "Jack high". */
  function holeName(hole) {
    const [x, y] = hole.map(value).sort((a, b) => b - a);
    return x === y ? `Pair of ${plural(x)}` : `${capFirst(WORD[x])} high`;
  }
  /* How good two hole cards are before the flop, 0 to 1: a pair from .55
     (deuces) to 1 (aces); else by the two ranks, a little more suited or
     close together. */
  function preflop(hole) {
    const [x, y] = hole.map(value).sort((a, b) => b - a);
    if (x === y) return 0.55 + (x - 2) / 12 * 0.45;
    let v = (x - 2) / 12 * 0.5 + (y - 2) / 12 * 0.25;
    if (suit(hole[0]) === suit(hole[1])) v += 0.06;
    if (x - y <= 2 || (x === 14 && y <= 5)) v += 0.05;
    return Math.min(0.9, v);
  }
  /* How good a seat's hand is after the flop, 0 to 1: what it makes with
     the board (worth less when the board makes it alone), and a draw to a
     flush or a straight before the river. */
  function strength(hole, board) {
    if (!board.length) return preflop(hole);
    const made = best(hole.concat(board));
    const hv = hole.map(value);
    const uses = v => hv.includes(v);
    let v;
    switch (made.rank) {
      case 0: v = 0.1 + (Math.max(...hv) - 2) / 120; break;
      case 1: v = uses(made.key[1]) ? 0.4 + (made.key[1] - 2) / 12 * 0.3 : 0.2; break;
      case 2: v = uses(made.key[1]) || uses(made.key[2]) ? 0.68 : 0.3; break;
      case 3: v = uses(made.key[1]) ? 0.85 : 0.4; break;
      default: v = 0.9;
    }
    if (made.rank >= 4 && board.length === 5 && compareKeys(best(board).key, made.key) >= 0) v = 0.4;
    if (board.length < 5 && made.rank < 4) {
      const all = hole.concat(board);
      const flushDraw = SUITS.split('').some(su => all.filter(c => suit(c) === su).length >= 4 && hole.some(c => suit(c) === su));
      const vals = Array.from(new Set(all.map(value)));
      let run = false;
      for (let low = 1; low <= 10 && !run; low++) {
        const inRun = vals.filter(x => (x >= low && x <= low + 4) || (low === 1 && x === 14));
        if (inRun.length >= 4 && hv.some(x => inRun.includes(x))) run = true;
      }
      if (flushDraw) v = Math.max(v, 0.45);
      else if (run) v = Math.max(v, 0.4);
    }
    return v;
  }
  /* A player's move at the table (wave 18: no-limit betting), as the stored
     hand and the record keep it: check, call, fold, win, allin, bet:N and
     raise:N (N the amount bet or raised to on the round), and at draw
     hold:024 (the positions held; "hold:" draws five). move(m) reads one
     (a string, or { act, to }, { hold }, { fold }, { win }) as { act, to? }
     or { act: 'hold', hold }, null when it is none; moveText(mv) writes it. */
  const MOVE_ACTS = Object.freeze(['check', 'bet', 'call', 'raise', 'fold', 'allin', 'win']);
  const MOVE_RE = /^(check|bet|call|raise|fold|allin|win)(?::(\d{1,7}))?$|^hold:([0-4]{0,5})$/;
  function move(m) {
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      if (m.win === true) return { act: 'win' };
      if (m.fold === true) return { act: 'fold' };
      if (m.hold !== undefined) return { act: 'hold', hold: holdsFrom(m.hold) };
      if (!MOVE_ACTS.includes(m.act)) return null;
      const to = toInt(m.to);
      return (m.act === 'bet' || m.act === 'raise') && to !== null && to > 0 ? { act: m.act, to } : { act: m.act };
    }
    const x = MOVE_RE.exec(String(m || ''));
    if (!x) return null;
    if (x[3] !== undefined) return { act: 'hold', hold: holdsFrom(x[3].split('').map(Number)) };
    return x[2] && (x[1] === 'bet' || x[1] === 'raise') && parseInt(x[2], 10) > 0 ? { act: x[1], to: parseInt(x[2], 10) } : { act: x[1] };
  }
  function moveText(mv) {
    if (!mv) return null;
    if (mv.act === 'hold') return `hold:${holdsFrom(mv.hold).join('')}`;
    return (mv.act === 'bet' || mv.act === 'raise') && mv.to ? `${mv.act}:${mv.to}` : mv.act;
  }
  return { RANKS, SUITS, RANK_NAMES, valid, value, suit, red, label, sign, cardName, deck, shuffle, evaluate, compare, compareKeys, dealerHolds, holdsFrom, draw, deal, fourToStraight, best, holdem, holdemStacked, holeName, preflop, strength, namesApart, MOVE_ACTS, move, moveText };
})();

