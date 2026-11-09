'use strict';
/* Wave 37, Creator Mode: the one way a Story Pack is written out as text
   (plan decision A). The owner: "convert Low Water to a JSON so it can be
   used as a story pack. No hard coded story allowed." packs/low-water.json is
   that JSON, and this printer is deterministic so the file, the copy inlined
   in index.html (tests/pack-inline.cjs) and the page's own Pack.format (a
   mirror of this file, pinned equal by a test) can be compared byte for byte
   and a hand edit diffs as a local change.
   The rules: 2-space indent, LF, a trailing newline, keys in authored order
   (never sorted: the author's order is part of the document); any array or
   object on ONE line when its whole one-line rendering, counting the indent
   and key in front of it and the comma after it, fits in 100 columns, else
   one entry per line, each entry laid out by the same rule (the
   orchestrator's change in M1-B: the first rule, which kept every array
   holding an object expanded, printed 7,251 lines against an estimate of
   about 3,900); strings as JSON.stringify writes them, then every "</" as
   "<\/" (a legal JSON escape, in keys too) so the text can never close the
   script element it is inlined in.
   Plain, dependency-free code: it is mirrored inside index.html. */

const WIDTH = 100;
const PAD = '  ';

function isScalar(v) { return v === null || typeof v !== 'object'; }

function str(v) { return JSON.stringify(v).split('</').join('<\\/'); }

/* The one-line rendering of any value: "[a, b]", "{ "k": v, ... }", "[]", "{}". */
function flat(v) {
  if (isScalar(v)) return str(v);
  if (Array.isArray(v)) return '[' + v.map(flat).join(', ') + ']';
  const keys = Object.keys(v);
  return keys.length ? '{ ' + keys.map(k => str(k) + ': ' + flat(v[k])).join(', ') + ' }' : '{}';
}

/* One value at depth `depth`; `head` is what already sits on its first line
   (indent plus `"key": `), `tail` the comma after it, both counted in WIDTH. */
function render(v, depth, head, tail) {
  if (isScalar(v)) return str(v);
  const line = flat(v);
  if (head.length + line.length + tail.length <= WIDTH) return line;
  const ind = PAD.repeat(depth);
  const inner = PAD.repeat(depth + 1);
  if (Array.isArray(v)) {
    const rows = v.map((x, i) => {
      const t = i < v.length - 1 ? ',' : '';
      return inner + render(x, depth + 1, inner, t) + t;
    });
    return '[\n' + rows.join('\n') + '\n' + ind + ']';
  }
  const keys = Object.keys(v);
  const rows = keys.map((k, i) => {
    const t = i < keys.length - 1 ? ',' : '';
    const h = inner + str(k) + ': ';
    return h + render(v[k], depth + 1, h, t) + t;
  });
  return '{\n' + rows.join('\n') + '\n' + ind + '}';
}

function format(pack) { return render(pack, 0, '', '') + '\n'; }

function parse(text) { return JSON.parse(text); }

/* Compact, keys sorted at every level: the same pack gives the same string
   whatever order its keys were written in (for hashing a pack later). */
function canonical(pack) {
  const sort = v => {
    if (isScalar(v)) return v;
    if (Array.isArray(v)) return v.map(sort);
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sort(v[k]);
    return out;
  };
  return JSON.stringify(sort(pack));
}

module.exports = { format, parse, canonical, WIDTH };
