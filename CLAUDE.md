# CLAUDE.md

Lockett's Ferry is a single-player text RPG in one town, played in the
browser. The player types an action; Claude (the player's own API key)
parses it, narrates it and records what changed, while the game's code owns
every fact, number and dice roll. It is one self-contained `index.html`
(about 37,000 lines: inline CSS, vanilla JS modules, an inline font),
generated from `src/` since wave 50.

## Read first, in this order

1. This file.
2. `docs/README.md`: which documents are current and which are history.
3. The area notes for what you are changing: `docs/notes/engine-state.md`,
   `engine-world.md`, `prompts.md`, `transport.md`, `ui.md`, `content.md`
   (append-only, newest wave at the end), and the first 60 lines of
   `docs/BUILD_PLAN.md` (the constraints and the module order).

`docs/MAINTAINING.md` has the workflows in full; `docs/KNOWN_ISSUES.md`
lists what is open, unverified or deliberately deferred. Check it before
"fixing" something that is known and parked.

## Hard constraints (several enforced by `tests/constraints.test.cjs`)

- One self-contained `index.html` that plays with no build, from `file://`
  and from any static host. No `package.json`, no `<script src>`, no module
  scripts, no fetch of local files.
- Edit `src/`, then run `node tools/build.cjs`, and commit both. Never
  hand-edit `index.html`; `tests/build.test.cjs` and CI's
  `node tools/build.cjs --check` fail when they disagree.
- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
  `eval`, `new Function`. Build DOM with the page's `el()` helper or
  `textContent`.
- No outside host but `api.anthropic.com`; the CSP is on line 8 and lists no
  other. The font is inline.
- Strict mode, no globals besides `Game`; every module is on `window.Game`.
- Module order (banners `// ===== Module: X =====`, one `src/` file each):
  `Rng`, `Dice`, `Cards`, `Tables`, `State`, `Rel`, `Town`, `World`,
  `Style`, `Api`, `Mock`, `Upgrade`, `Pipeline`, `Storage`, `UI`,
  `Commands`, `App`, after the content block and the helpers.
- Code owns every fact, number and dice roll. The narrator never decides an
  outcome, and nothing new enters the world except through code (the cast is
  fixed: the game never makes a person up).
- Non-negotiable: the minor guard (nobody under 18 is part of a romance, at
  every writer) and the coercion rule (fear or leverage never buys a romantic
  yes, however the line is put).
- Mark changes `// Wave N: ...` in code and in the module's header comment.

## Content

The town lives in `src/30-content.js` between `// ===== BEGIN CONTENT =====`
and `// ===== END CONTENT =====` (plain data, double-quoted strings; shape in
BUILD_PLAN's "Shared data contract"). After a content edit:

```
node tools/build.cjs
node tests/validate-town.cjs
node tests/cast-doc.cjs           # regenerates docs/CAST.md; never edit it by hand
```

## A rules change

Anything that changes what an older save means: bump `RULES_VERSION`
(`src/54-state.js`), add an Upgrade step (`Upgrade.MIGRATIONS`,
`src/61-upgrade.js`), add the previous version's last commit to `BUILDS` in
`tests/fixtures/make-saves.cjs` and run it to freeze that version's save, and
add a row to the README's rules table (a test pins version 10's row there).

## Every wave

- Bump the one line `const BUILD = Object.freeze({ wave: N, date: '…' });`
  in `src/54-state.js`, rebuild, and add CHANGELOG.md's top entry for the
  same wave and date (player-facing, one or two sentences).
  `tests/wave46-head.test.cjs` enforces both.
- Docs checklist: the README or the MANUAL/MAINTAINING section that changed;
  a `docs/notes/<area>.md` entry ("## Wave N (date): title", what changed,
  the names in code, the tests); a bullet under BUILD_PLAN's latest direction
  change; the CHANGELOG entry; the Build bump.

## Tests

```
node tests/run.cjs [filter] [-j N]   # all: about 9 minutes at the default -j 3; -j 1 is serial
node tests/run.cjs wave46-head       # files whose name contains the filter
node tools/build.cjs --check
node tests/relationships-sim.cjs [style] --assert   # the 21-day simulator
node tests/eval-classify.cjs --dry                  # the labelled eval, offline
ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs    # needs a key; passed on 4 Nov 2026 (wave 52)
```

Playwright and Chromium are preinstalled: `require('playwright')`. Never run
`npx playwright install`, never add a `package.json`. Everything runs in mock
mode with the network blocked. Every behaviour you add or change gets a test;
never skip, weaken or delete one to get green. The feature-to-suite table is
in `docs/MAINTAINING.md`, "Running the tests".

## Commits

One plain sentence about what the player or maintainer gets ("A long game
keeps its undo and its saves without filling the device: …"), then a short
body: what changed and which tests cover it. See `git log --oneline -20`.
