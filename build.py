#!/usr/bin/env python3
"""Bundle the modular source into a single self-contained HTML file.

Edit the source files (index.html, styles.css, *.js, vendor/exceljs.min.js),
then run `python3 build.py` to regenerate `Slurry-Pump-Calc.html` — one file
you can double-click or email, no other files needed.
"""
import pathlib, re, sys

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')

def read(p):
    return (root / p).read_text(encoding='utf-8')

# Inline the stylesheet
css = read('styles.css')
html = html.replace(
    '<link rel="stylesheet" href="styles.css" />',
    '<style>\n' + css + '\n</style>'
)

# Inline each <script src="..."></script> in document order
def inline_script(m):
    src = m.group(1)
    code = read(src)
    if '</script' in code.lower():
        sys.exit('ERROR: %s contains a </script token and cannot be safely inlined.' % src)
    return '<script>\n' + code + '\n</script>'

html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

out = root / 'Slurry-Pump-Calc.html'
out.write_text(html, encoding='utf-8')
kb = out.stat().st_size / 1024
print('Wrote %s (%.0f KB) — open this file directly.' % (out.name, kb))
