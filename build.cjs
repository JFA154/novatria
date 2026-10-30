#!/usr/bin/env node
'use strict';
/* Builds index.html, the one file the player opens, from its parts:
     src/head.html     everything before the content: the document head, the
                       CSS, the body markup and the opening of the page script
     content/town.js   the town and the character-creation data (the text
                       between the BEGIN and END CONTENT markers)
     src/NN-name.js    the engine: the narrator's style guides, the helpers,
                       then one file per module, joined in the order of NN
     src/tail.html     the end of the page script and of the document
   The parts are joined byte for byte. The build adds only the two content
   markers (each on its own line, a blank line after the end marker) and a
   one-line banner at the top of the page script saying the file is built.
   index.html stays committed: it is what GitHub Pages serves and what
   file:// opens, and playing needs no build (docs/BUILD_PLAN.md, direction
   change 17). Plain node, no dependencies.
   Usage: node build.cjs                  writes index.html
          node build.cjs --check [file]   exits 1 when index.html (or file) is not what the parts build
   tests/constraints.test.cjs runs the check, so an edit to index.html by
   hand, or to a part without a rebuild, fails the suite. */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'index.html');
const BEGIN = '// ===== BEGIN CONTENT =====';
const END = '// ===== END CONTENT =====';
const BANNER = '// Built by build.cjs from src/ and content/town.js: edit those, not this file, then run node build.cjs (node build.cjs --check says whether this file is up to date).';
const SCRIPT_TAG = '<script>\n';
const PART = /^(\d+)-[a-z0-9-]+\.js$/;

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// A part saved without a final newline must not run into the next one.
function ending(s) { return s.endsWith('\n') ? s : s + '\n'; }

/* The engine parts, src/NN-name.js, in the order of their numbers. */
function engineParts() {
  return fs.readdirSync(path.join(ROOT, 'src')).filter(f => PART.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b))
    .map(f => 'src/' + f);
}

/* The text of index.html as the parts make it. Throws with a plain reason
   when a part is missing or malformed. */
function build() {
  const head = read('src/head.html');
  const at = head.lastIndexOf(SCRIPT_TAG);
  if (at < 0) throw new Error('src/head.html has no "<script>" line to open the page script');
  const town = read('content/town.js');
  if (town.includes(BEGIN) || town.includes(END)) throw new Error('content/town.js holds a content marker: the build writes them, so take it out');
  const parts = engineParts();
  if (!parts.length) throw new Error('src/ has no engine parts (NN-name.js)');
  return head.slice(0, at + SCRIPT_TAG.length) + BANNER + '\n' + head.slice(at + SCRIPT_TAG.length)
    + BEGIN + '\n' + ending(town) + END + '\n\n'
    + parts.map(p => ending(read(p))).join('')
    + read('src/tail.html');
}

/* True when file (index.html by default) is exactly what the parts build. */
function isCurrent(file) {
  const f = file || OUT;
  return fs.existsSync(f) && fs.readFileSync(f, 'utf8') === build();
}

module.exports = { build, isCurrent, engineParts, BEGIN, END, BANNER };

if (require.main === module) {
  const args = process.argv.slice(2);
  let text;
  try {
    text = build();
  } catch (e) {
    console.error('build.cjs: ' + e.message);
    process.exit(1);
  }
  if (args[0] === '--check') {
    const file = args[1] ? path.resolve(args[1]) : OUT;
    const name = path.relative(process.cwd(), file) || file;
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (have !== text) {
      let where = '';
      if (have !== null) {
        const a = have.split('\n');
        const b = text.split('\n');
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        where = ` (first difference at line ${i + 1})`;
      }
      console.error(`${name} is not what src/ and content/ build${have === null ? ' (missing)' : where}: run node build.cjs`);
      process.exit(1);
    }
    console.log(`${name} matches src/ and content/`);
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote index.html from src/head.html, content/town.js, ${engineParts().length} engine parts and src/tail.html (${text.length} characters)`);
  }
}
