#!/usr/bin/env python3
"""Bones' embedded type: rebuilds the <style id="fonts"> block of index.html.

Not part of the tests and not a build step: the block is committed, and this is
how it was made (run it only to add a letter or change a face).

    pip install fonttools brotli
    npm i @fontsource-variable/besley @fontsource/besley \
          @fontsource/barlow-semi-condensed @fontsource/barlow-condensed   # anywhere outside this folder
    python3 tests/bones-type.py /path/to/node_modules

It cuts each face down to the letters, figures and marks the page sets (GLYPHS),
brings Besley's line metrics down to what its glyphs need (it ships with an
ascent of 1.25 em and a descent of .425, room for stacked accents this page
never sets; left alone, a line of it measures taller than its own line box and
the table's layout checks fail), and writes the faces into the page as base64
woff2. Both families are under the SIL Open Font License 1.1.
"""
import base64, io, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLYPHS = ('U+0020-007E,U+00A0,U+00A2,U+00A3,U+00A9,U+00AB,U+00B0,U+00B7,U+00BB,U+00BD,U+00D7,U+00E9,'
          'U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2212')
# (family, weights, style, source under node_modules, tighten the line metrics)
FACES = [
    ('Besley', '400 900', 'normal', '@fontsource-variable/besley/files/besley-latin-wght-normal.woff2', True),
    ('Besley', '400 900', 'italic', '@fontsource/besley/files/besley-latin-500-italic.woff2', True),
    ('Barlow Semi Condensed', '400', 'normal', '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff2', False),
    ('Barlow Semi Condensed', '600 700', 'normal', '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2', False),
    ('Barlow Condensed', '600 800', 'normal', '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2', False),
]
HEAD = '''<style id="fonts">
/* The type, embedded so the page stands alone: Besley (Copyright 2020 The Besley Project Authors,
   github.com/indestructible-type/Besley) and Barlow Semi Condensed / Barlow Condensed (Copyright 2017 The Barlow
   Project Authors, github.com/jpt/barlow), both under the SIL Open Font License 1.1 (openfontlicense.org), cut
   down to the Latin letters, figures and marks this page uses, Besley's line metrics tightened to its glyphs.
   Without them the page falls back to Georgia and the system sans. Made by tests/bones-type.py. */
'''


def face(src, tighten):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'tnum']
    font = subset.load_font(src, opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(GLYPHS))
    sub.subset(font)
    if tighten:
        upm = font['head'].unitsPerEm
        up, down = round(.895 * upm), round(.205 * upm)
        font['hhea'].ascent, font['hhea'].descent, font['hhea'].lineGap = up, -down, 0
        os2 = font['OS/2']
        os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = up, -down, 0
        os2.usWinAscent, os2.usWinDescent = up, round(.27 * upm)
    out = io.BytesIO()
    font.flavor = 'woff2'
    font.save(out)
    return out.getvalue()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    mods = sys.argv[1]
    block, total = HEAD, 0
    for family, weight, style, src, tighten in FACES:
        data = face(os.path.join(mods, src), tighten)
        total += len(data)
        block += ('@font-face { font-family: "%s"; font-weight: %s; font-style: %s; font-display: swap; '
                  'src: url(data:font/woff2;base64,%s) format("woff2"); }\n' % (family, weight, style, base64.b64encode(data).decode()))
    block += '</style>\n'
    page = os.path.join(ROOT, 'index.html')
    html = open(page, encoding='utf8').read()
    a = html.index('<style id="fonts">')
    b = html.index('</style>', a) + len('</style>\n')
    open(page, 'w', encoding='utf8').write(html[:a] + block + html[b:])
    print('%d faces, %d bytes of woff2, written into index.html' % (len(FACES), total))


if __name__ == '__main__':
    main()
