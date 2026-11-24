# Schriftzug „pRoBe“ (Variante 5 „Schattenwurf“): eigene Blockbuchstaben mit Schattenwurf, R gespiegelt.
# Keine Schriftdatei, keine externe Quelle – reine Geometrie. Erzeugt app/logo.svg (mit Senf-Plakette) und app/logo-plain.svg.
import os
T = 24  # Strichstärke; Grundlinie y=100, x-Höhe y=24, Versalhöhe y=0, Unterlänge y=128
G = {  # (Breite, Außenkontur, Innenkonturen) – Fasen an den Ecken für den 70er-Look
 'p': (72, [(0,24),(60,24),(72,36),(72,88),(60,100),(24,100),(24,128),(0,128)], [[(24,44),(49,44),(49,80),(24,80)]]),
 'R': (80, [(0,0),(66,0),(80,14),(80,46),(72,54),(80,62),(80,100),(56,100),(56,72),(24,72),(24,100),(0,100)], [[(24,20),(57,20),(57,50),(24,50)]]),
 'o': (72, [(12,24),(60,24),(72,36),(72,88),(60,100),(12,100),(0,88),(0,36)], [[(23,44),(49,44),(49,80),(23,80)]]),
 'B': (80, [(0,0),(64,0),(78,14),(78,40),(70,49),(80,58),(80,86),(66,100),(0,100)], [[(24,20),(54,20),(54,40),(24,40)],[(24,58),(56,58),(56,80),(24,80)]]),
 'e': (72, [(12,24),(60,24),(72,36),(72,68),(24,68),(24,80),(72,80),(72,100),(12,100),(0,88),(0,36)], [[(24,42),(48,42),(48,54),(24,54)]]),
}
GAP, D = 10, 9  # Abstand, Tiefe des Schattenwurfs
def word(text='pRoBe', mirror='R'):
    x, paths = 0, []
    for ch in text:
        w, outer, holes = G[ch]
        tf = (lambda p, x=x, w=w: (x + w - p[0], p[1])) if ch == mirror else (lambda p, x=x: (x + p[0], p[1]))
        ring = lambda pts, rev: ' '.join(('M' if i == 0 else 'L') + f'{a:g} {b:g}' for i, (a, b) in enumerate((list(reversed(pts)) if rev else pts) and [tf(p) for p in (list(reversed(pts)) if rev else pts)])) + 'Z'
        d = ring(outer, ch == mirror) + ''.join(ring(h, ch != mirror) for h in holes)  # Löcher gegenläufig (auch gespiegelt)
        paths.append((ch, d)); x += w + GAP
    return x - GAP, paths
def svg(plate=True, face='#F4E9D3', rface='#E8692C', ink='#3B2416', bg='#F2B035'):
    W, P = word(); pad = 26 if plate else 6
    vw, vh = W + D + 2 * pad, 128 + D + 2 * pad - (0 if plate else 0)
    ext = ''.join(f'<path d="{d}" transform="translate({k} {k})"/>' for _, d in P for k in range(1, D + 1))
    front = ''.join(f'<path d="{d}" fill="{rface if ch == "R" else face}"/>' for ch, d in P)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {vw} {vh}" role="img" aria-label="Probe">'
            + (f'<rect x="{-pad}" y="{-pad}" width="{vw}" height="{vh}" rx="22" fill="{bg}"/>' if plate else '')
            + f'<g fill="{ink}" stroke="{ink}" stroke-width="5" stroke-linejoin="round">{ext}</g>'
            + f'<g stroke="{ink}" stroke-width="5" stroke-linejoin="round">{front}</g></svg>\n')
root = os.path.join(os.path.dirname(__file__), '..', 'app')
open(os.path.join(root, 'logo.svg'), 'w').write(svg(True))
open(os.path.join(root, 'logo-plain.svg'), 'w').write(svg(False))
print('ok', word()[0])
