#!/usr/bin/env node
'use strict';
/* Bones' home-screen icons (icons/): the wild one, a bone die showing its red pip, thrown on the felt.
   Not part of the tests: the PNGs are committed, and this is how they were drawn (Playwright's Chromium
   renders one SVG at each size). The maskable icon keeps the die inside the safe zone.
   Run with: node tests/bones-icons.cjs */
const path = require('path');
const { chromium } = require('playwright');
const svg = (size, k) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs><radialGradient id="f" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#24694d"/><stop offset=".6" stop-color="#1b5a41"/><stop offset="1" stop-color="#114030"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#f)"/>
<g transform="translate(256 262) rotate(-9) scale(${k})">
<rect x="-150" y="-128" width="300" height="300" rx="62" fill="#0b2a1f" opacity=".6"/>
<rect x="-150" y="-150" width="300" height="300" rx="62" fill="#b5a57f"/>
<rect x="-150" y="-150" width="300" height="276" rx="60" fill="#f6eedb"/>
<circle cx="0" cy="-12" r="54" fill="#8f2616"/><circle cx="0" cy="-8" r="52" fill="#d8432b"/>
</g></svg>`;
(async () => {
  const browser = await chromium.launch();
  for (const [name, size, k] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, .78], ['apple-touch-icon.png', 180, .92]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0">${svg(size, k)}</body>`);
    await page.screenshot({ path: path.resolve(__dirname, '..', 'icons', name), clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
  await browser.close();
})();
