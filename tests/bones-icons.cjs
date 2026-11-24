#!/usr/bin/env node
'use strict';
/* Bones' home-screen icons (icons/): the wild one, a bone die showing its red pip, on the felt under the lamp.
   Not part of the tests: the PNGs are committed, and this is how they were drawn (Playwright's Chromium
   renders one SVG at each size). The maskable icon keeps the die inside the safe zone.
   Run with: node tests/bones-icons.cjs */
const path = require('path');
const { chromium } = require('playwright');
const svg = (size, k) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs>
<radialGradient id="f" cx="50%" cy="34%" r="78%"><stop offset="0" stop-color="#1c8d63"/><stop offset=".55" stop-color="#0f6b4b"/><stop offset="1" stop-color="#06382a"/></radialGradient>
<linearGradient id="b" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset=".42" stop-color="#f5f0e3"/><stop offset="1" stop-color="#e4dcc8"/></linearGradient>
<radialGradient id="p" cx="50%" cy="68%" r="62%"><stop offset="0" stop-color="#f4525a"/><stop offset="1" stop-color="#e0282f"/></radialGradient>
<filter id="s" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur stdDeviation="16"/></filter>
</defs>
<rect width="512" height="512" fill="url(#f)"/>
<g transform="translate(256 258) rotate(-9) scale(${k})">
<rect x="-146" y="-112" width="292" height="292" rx="62" fill="#000" opacity=".5" filter="url(#s)"/>
<rect x="-150" y="-150" width="300" height="300" rx="62" fill="#b8ad93"/>
<rect x="-150" y="-150" width="300" height="282" rx="60" fill="url(#b)"/>
<rect x="-144" y="-146" width="288" height="60" rx="56" fill="#fff" opacity=".55"/>
<rect x="-150" y="-142" width="300" height="274" rx="60" fill="url(#b)"/>
<circle cx="0" cy="-12" r="56" fill="#8a0b12"/><circle cx="0" cy="-4" r="52" fill="url(#p)"/>
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
