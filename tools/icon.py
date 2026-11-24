# App-Symbol „Raumsonde“ als Pixelbild (32 × 32): Nachthimmel, Sterne, Parabolantenne, goldener Körper, Solarflügel, Funkwellen.
# Erzeugt app/icon.svg (scharfe Pixel, ein Rechteck je Farblauf); die PNGs macht tools/icons-png.py daraus.
import os
N = 32
C = {'.': '#141c44', ',': '#1b2658', '*': '#ffffff', 's': '#8f9bd0', 'B': '#2f6fe0', 'b': '#1f4fb0', 'L': '#9cc3ff', 'G': '#ffd27a', 'O': '#e09a24', 'K': '#8a5310',
     'W': '#ffffff', 'w': '#c9d3ea', 'g': '#8e9bbd', 'C': '#7fd3ff', 'A': '#d7deef', 'Y': '#ffe58a'}
px = [['.'] * N for _ in range(N)]
def put(x, y, c):
    if 0 <= x < N and 0 <= y < N: px[y][x] = c
def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): put(x, y, c)
# leichter Verlauf: obere Hälfte etwas heller
for y in range(0, 14): rect(0, y, N - 1, y, ',' if y < 6 else '.')
# Sterne
for x, y, c in [(4, 5, '*'), (8, 27, 's'), (27, 26, '*'), (5, 18, 's'), (24, 13, 's'), (12, 3, 's'), (29, 20, 's'), (3, 11, '*')]: put(x, y, c)
# Funkwellen oben rechts
for x, y in [(23, 4), (24, 4), (25, 5), (26, 6), (26, 7)]: put(x, y, 'C')
for x, y in [(23, 1), (24, 1), (25, 1), (26, 2), (27, 3), (28, 4), (29, 5), (29, 6), (29, 7)]: put(x, y, 'C')
# Antenne
rect(15, 4, 16, 9, 'A'); rect(15, 3, 16, 3, 'Y'); put(14, 3, 'O'); put(17, 3, 'O'); rect(15, 2, 16, 2, 'O')
# Parabolschüssel
rect(9, 10, 22, 10, 'W'); rect(10, 11, 21, 11, 'W'); rect(11, 12, 20, 12, 'w'); rect(13, 13, 18, 13, 'g')
put(8, 10, 'g'); put(23, 10, 'g'); put(9, 11, 'g'); put(22, 11, 'g'); put(10, 12, 'g'); put(21, 12, 'g'); rect(11, 13, 12, 13, 'g'); rect(19, 13, 20, 13, 'g')
# Hals
rect(15, 14, 16, 14, 'A')
# Körper (Goldfolie)
rect(12, 15, 19, 23, 'K'); rect(13, 16, 18, 22, 'G'); rect(13, 19, 18, 19, 'O'); rect(13, 22, 18, 22, 'O'); rect(13, 16, 14, 16, 'Y')
# Streben
rect(9, 18, 11, 19, 'g'); rect(20, 18, 22, 19, 'g')
# Solarflügel mit Zellen
for x0 in (1, 23):
    rect(x0, 15, x0 + 7, 22, 'b'); rect(x0 + 1, 16, x0 + 6, 21, 'B')
    for x in (x0 + 3, x0 + 5): rect(x, 16, x, 21, 'L')
    rect(x0 + 1, 18, x0 + 6, 18, 'L')
# Düse unten
rect(14, 24, 17, 24, 'g'); rect(15, 25, 16, 25, 'A')
# abgerundete Ecken (durchsichtig)
for y, k in [(0, 3), (1, 2), (2, 1)]:
    for x in range(k): put(x, y, None); put(N - 1 - x, y, None); put(x, N - 1 - y, None); put(N - 1 - x, N - 1 - y, None)
out = []
for y in range(N):
    x = 0
    while x < N:
        c = px[y][x]; s = x
        while x < N and px[y][x] == c: x += 1
        if c: out.append(f'<rect x="{s}" y="{y}" width="{x - s}" height="1" fill="{C[c]}"/>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" shape-rendering="crispEdges">' + ''.join(out) + '</svg>\n'
open(os.path.join(os.path.dirname(__file__), '..', 'app', 'icon.svg'), 'w').write(svg)
print('icon.svg', len(svg), 'Bytes')
