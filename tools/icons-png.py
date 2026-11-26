# PNG-Symbole aus app/icon.svg (Raumsonde vor Multiple-Choice-Test): 32, 180, 192, 512 px. Braucht Playwright (Chromium).
import os
from playwright.sync_api import sync_playwright
app = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
svg = open(os.path.join(app, 'icon.svg')).read()
with sync_playwright() as p:
    b = p.chromium.launch()
    for n in (32, 180, 192, 512):
        pg = b.new_page(viewport={'width': n, 'height': n})
        bg = '#ffffff' if n == 180 else 'transparent'  # iOS-Startbildschirm: keine durchsichtigen Ecken
        pg.set_content(f'<body style="margin:0;background:{bg}"><div style="width:{n}px;height:{n}px">{svg.replace("<svg ", f"<svg width=\'{n}\' height=\'{n}\' ")}</div></body>')
        pg.screenshot(path=os.path.join(app, f'icon-{n}.png'), omit_background=n != 180, clip={'x': 0, 'y': 0, 'width': n, 'height': n})
    b.close()
print('PNG ok')
