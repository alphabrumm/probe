// QR-Codes lesen, ohne Bibliothek – für den PathFinder Player (Koppeln direkt in der App, z. B. im Web-Clip aus dem MDM).
// Gelesen wird, was Probe selbst erzeugt (app/qr.js): Byte-Modus, Fehlerkorrektur M, Versionen 1–10.
// Ablauf: Graustufen → Schwarz/Weiß (örtliche Schwelle) → drei Suchmuster → Perspektive (mit Ausrichtungsmuster) → Module abtasten
// → Formatinfo → Maske → Zickzack → Blöcke → Reed-Solomon-Korrektur → Text (UTF-8).
import { EC_M, ALIGN } from './qr.js';

/* ---------- Galois-Feld GF(256), Polynom 0x11D, und Reed-Solomon-Dekodierung ---------- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
const pow = (a, n) => EXP[(((LOG[a] * n) % 255) + 255) % 255];
const inv = a => EXP[255 - LOG[a]];
const div = (a, b) => a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0;
const pScale = (p, x) => p.map(c => mul(c, x));
const pAdd = (p, q) => { const r = Array(Math.max(p.length, q.length)).fill(0); p.forEach((c, i) => { r[i + r.length - p.length] = c; }); q.forEach((c, i) => { r[i + r.length - q.length] ^= c; }); return r; };
const pMul = (p, q) => { const r = Array(p.length + q.length - 1).fill(0); for (let j = 0; j < q.length; j++) for (let i = 0; i < p.length; i++) r[i + j] ^= mul(p[i], q[j]); return r; };
const pEval = (p, x) => { let y = p[0]; for (let i = 1; i < p.length; i++) y = mul(y, x) ^ p[i]; return y; };
const pDivRem = (a, d) => { const o = a.slice(); for (let i = 0; i < a.length - (d.length - 1); i++) { const c = o[i]; if (c) for (let j = 1; j < d.length; j++) if (d[j]) o[i + j] ^= mul(d[j], c); } return o.slice(o.length - (d.length - 1)); };
/** Block (Daten + Fehlerkorrektur) korrigieren; null, wenn zu viele Fehler */
export function rsDecode(msg, nsym) {
  const synd = [0]; for (let i = 0; i < nsym; i++) synd.push(pEval(msg, pow(2, i)));
  if (synd.every(s => !s)) return msg.slice(0, msg.length - nsym);
  // Berlekamp-Massey
  let loc = [1], old = [1];
  for (let i = 0; i < nsym; i++) {
    const K = i + 1; let delta = synd[K];
    for (let j = 1; j < loc.length; j++) delta ^= mul(loc[loc.length - 1 - j], synd[K - j]);
    old = old.concat([0]);
    if (delta) { if (old.length > loc.length) { const nl = pScale(old, delta); old = pScale(loc, inv(delta)); loc = nl; } loc = pAdd(loc, pScale(old, delta)); }
  }
  while (loc.length && !loc[0]) loc.shift();
  const errs = loc.length - 1; if (errs * 2 > nsym) return null;
  // Chien-Suche: Fehlerstellen
  const rl = loc.slice().reverse(), pos = [];
  for (let i = 0; i < msg.length; i++) if (pEval(rl, pow(2, i)) === 0) pos.push(msg.length - 1 - i);
  if (pos.length !== errs) return null;
  // Forney: Fehlerwerte
  const coef = pos.map(p => msg.length - 1 - p);
  let eloc = [1]; for (const c of coef) eloc = pMul(eloc, pAdd([1], [pow(2, c), 0]));
  const ev = pDivRem(pMul(synd.slice().reverse(), eloc), [1].concat(Array(eloc.length).fill(0))).reverse();
  const X = coef.map(c => pow(2, -(255 - c))), E = Array(msg.length).fill(0);
  X.forEach((Xi, i) => {
    const Xinv = inv(Xi); let prime = 1;
    X.forEach((Xj, j) => { if (j !== i) prime = mul(prime, 1 ^ mul(Xinv, Xj)); });
    if (!prime) return;
    const y = mul(Xi, pEval(ev.slice().reverse(), Xinv));
    E[pos[i]] = div(y, prime);
  });
  const out = pAdd(msg, E);
  for (let i = 0; i < nsym; i++) if (pEval(out, pow(2, i))) return null;
  return out.slice(0, out.length - nsym);
}

/* ---------- Matrix (true = dunkel) → Text ---------- */
const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
const FORMATS = []; // alle 32 gültigen Formatwörter: [Wort, Fehlerkorrektur-Stufe, Maske]
for (let d = 0; d < 32; d++) { let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); FORMATS.push([((d << 10) | r) ^ 0x5412, d >> 3, d & 7]); }
const bitsSet = x => { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
export function decodeMatrix(M) {
  const size = M.length, v = (size - 17) / 4; if (!EC_M[v]) return null;
  const g = (x, y) => (M[y][x] ? 1 : 0);
  let f1 = 0, f2 = 0;
  for (let i = 0; i <= 5; i++) f1 |= g(8, i) << i; f1 |= g(8, 7) << 6; f1 |= g(8, 8) << 7; f1 |= g(7, 8) << 8; for (let i = 9; i < 15; i++) f1 |= g(14 - i, 8) << i;
  for (let i = 0; i < 8; i++) f2 |= g(size - 1 - i, 8) << i; for (let i = 8; i < 15; i++) f2 |= g(8, size - 15 + i) << i;
  let best = null, bd = 99;
  for (const F of FORMATS) { const d = Math.min(bitsSet(F[0] ^ f1), bitsSet(F[0] ^ f2)); if (d < bd) { bd = d; best = F; } }
  if (!best || bd > 3 || best[1] !== 0) return null; // nur Fehlerkorrektur M (Bits 00)
  const mask = MASKS[best[2]];
  // Funktionsmodule
  const fn = (x, y) => {
    if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8) || x === 6 || y === 6) return true;
    const A = ALIGN[v];
    for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === A.length - 1) || (i === A.length - 1 && j === 0)) continue;
      if (Math.abs(x - A[i]) <= 2 && Math.abs(y - A[j]) <= 2) return true;
    }
    if (v >= 7 && ((x >= size - 11 && x < size - 8 && y < 6) || (y >= size - 11 && y < size - 8 && x < 6))) return true;
    return false;
  };
  const [ecLen, groups] = EC_M[v], blocks = []; for (const [n, d] of groups) for (let i = 0; i < n; i++) blocks.push({ d, data: [], ec: [] });
  const total = blocks.reduce((s, b) => s + b.d + ecLen, 0), bytes = []; let cur = 0, nb = 0;
  for (let right = size - 1; right >= 1 && bytes.length < total; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (fn(x, y)) continue;
      cur = (cur << 1) | (g(x, y) ^ (mask(x, y) ? 1 : 0)); nb++;
      if (nb === 8) { bytes.push(cur); cur = 0; nb = 0; }
    }
  }
  if (bytes.length < total) return null;
  let k = 0; const maxD = Math.max(...blocks.map(b => b.d));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d) b.data.push(bytes[k++]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) b.ec.push(bytes[k++]);
  const data = [];
  for (const b of blocks) { const r = rsDecode(b.data.concat(b.ec), ecLen); if (!r) return null; data.push(...r); }
  // Segmente: nur Byte-Modus (4); Ende bei 0000
  let bp = 0; const read = n => { let x = 0; for (let i = 0; i < n; i++) { const by = data[bp >> 3]; x = (x << 1) | (by === undefined ? 0 : (by >> (7 - (bp & 7))) & 1); bp++; } return x; };
  const out = [];
  while (bp + 4 <= data.length * 8) {
    const mode = read(4); if (mode === 0) break; if (mode !== 4) return null;
    const n = read(v < 10 ? 8 : 16); if (bp + n * 8 > data.length * 8) return null;
    for (let i = 0; i < n; i++) out.push(read(8));
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(out)); } catch (e) { return null; }
}

/* ---------- Bild → Matrix ---------- */
/** Schwarz/Weiß mit örtlicher Schwelle (Blöcke 8×8, Mittel über 5×5 Blöcke), 1 = dunkel */
function binarize(G, w, h) {
  const B = 8, bw = Math.ceil(w / B), bh = Math.ceil(h / B), bp = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let sum = 0, mn = 255, mx = 0, n = 0;
    for (let y = by * B; y < Math.min(h, by * B + B); y++) for (let x = bx * B; x < Math.min(w, bx * B + B); x++) { const p = G[y * w + x]; sum += p; if (p < mn) mn = p; if (p > mx) mx = p; n++; }
    let avg = sum / n;
    if (mx - mn <= 24) { avg = mn / 2; if (by > 0 && bx > 0) { const nb = (bp[(by - 1) * bw + bx] + 2 * bp[by * bw + bx - 1] + bp[(by - 1) * bw + bx - 1]) / 4; if (mn < nb) avg = nb; } }
    bp[by * bw + bx] = avg;
  }
  const out = new Uint8Array(w * h);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0, n = 0;
    for (let yy = Math.max(0, by - 2); yy <= Math.min(bh - 1, by + 2); yy++) for (let xx = Math.max(0, bx - 2); xx <= Math.min(bw - 1, bx + 2); xx++) { s += bp[yy * bw + xx]; n++; }
    const t = s / n;
    for (let y = by * B; y < Math.min(h, by * B + B); y++) for (let x = bx * B; x < Math.min(w, bx * B + B); x++) out[y * w + x] = G[y * w + x] <= t ? 1 : 0;
  }
  return out;
}
const ratioOk = (c, mid3 = true) => {
  const tot = c.reduce((a, b) => a + b, 0); if (tot < 7) return false;
  const m = tot / 7, v = m / 1.6;
  return Math.abs(m - c[0]) < v && Math.abs(m - c[1]) < v && Math.abs(3 * m - c[2]) < 3 * v && Math.abs(m - c[3]) < v && Math.abs(m - c[4]) < v;
};
/** Suchmuster (1:1:3:1:1) finden: Zeilen abtasten, senkrecht und waagrecht gegenprüfen */
function findFinders(I, w, h) {
  const at = (x, y) => I[y * w + x];
  const cross = (cx, cy, dx, dy, maxC) => { // Läufe in beide Richtungen ab der Mitte
    const c = [0, 0, 0, 0, 0]; let x = cx, y = cy;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y)) { c[2]++; x -= dx; y -= dy; }
    while (x >= 0 && y >= 0 && x < w && y < h && !at(x, y) && c[1] <= maxC) { c[1]++; x -= dx; y -= dy; }
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y) && c[0] <= maxC) { c[0]++; x -= dx; y -= dy; }
    x = cx + dx; y = cy + dy;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y)) { c[2]++; x += dx; y += dy; }
    const endMid = dx ? x : y;
    while (x >= 0 && y >= 0 && x < w && y < h && !at(x, y) && c[3] <= maxC) { c[3]++; x += dx; y += dy; }
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y) && c[4] <= maxC) { c[4]++; x += dx; y += dy; }
    if (!ratioOk(c)) return null;
    return { center: endMid - c[2] / 2 - (dx ? 0 : 0), size: c.reduce((a, b) => a + b, 0) / 7 };
  };
  const C = [];
  for (let y = 0; y < h; y += 2) {
    const runs = []; let col = at(0, y), len = 0, start = 0;
    for (let x = 0; x <= w; x++) {
      const p = x < w ? at(x, y) : -1;
      if (p === col) { len++; continue; }
      runs.push({ col, len, start }); col = p; start = x; len = 1;
    }
    for (let i = 0; i + 5 <= runs.length; i++) {
      if (runs[i].col !== 1) continue;
      const c = runs.slice(i, i + 5).map(r => r.len); if (!ratioOk(c)) continue;
      const cx0 = Math.round(runs[i + 2].start + runs[i + 2].len / 2), tot = c.reduce((a, b) => a + b, 0);
      const vy = cross(cx0, y, 0, 1, tot); if (!vy) continue;
      const cy = Math.round(vy.center), hx = cross(cx0, cy, 1, 0, tot); if (!hx) continue;
      const cx = hx.center, ms = (vy.size + hx.size) / 2;
      const near = C.find(p => Math.abs(p.x - cx) < ms * 2 && Math.abs(p.y - cy) < ms * 2 && Math.abs(p.ms - ms) < ms * .6);
      if (near) { near.x = (near.x * near.n + cx) / (near.n + 1); near.y = (near.y * near.n + cy) / (near.n + 1); near.ms = (near.ms * near.n + ms) / (near.n + 1); near.n++; }
      else C.push({ x: cx, y: cy, ms, n: 1 });
    }
  }
  return C;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Modulgröße entlang der Linie zwischen zwei Suchmustern: von der Mitte bis zum äußeren Rand sind es 3,5 Module (robust bei Drehung) */
function msAlong(I, w, h, a, b) {
  const d = dist(a, b), ux = (b.x - a.x) / d, uy = (b.y - a.y) / d; let st = 0;
  for (let t = 0; t < d / 2; t += .5) {
    const x = Math.round(a.x + ux * t), y = Math.round(a.y + uy * t); if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const p = I[y * w + x];
    if (st === 0 && !p) st = 1; else if (st === 1 && p) st = 2; else if (st === 2 && !p) return t / 3.5;
  }
  return null;
}
/** drei Suchmuster, die ein rechtwinklig-gleichschenkliges Dreieck bilden: oben links, oben rechts, unten links */
function pickThree(C) {
  const mx = Math.max(0, ...C.map(c => c.n)), L = C.filter(c => c.n >= Math.max(2, mx * .3)).sort((a, b) => b.n - a.n).slice(0, 8); let best = null, bs = Infinity;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) for (let k = j + 1; k < L.length; k++) {
    const P = [L[i], L[j], L[k]], ms = P.map(p => p.ms); if (Math.max(...ms) > 1.6 * Math.min(...ms)) continue;
    const d = [[dist(P[1], P[2]), 0], [dist(P[0], P[2]), 1], [dist(P[0], P[1]), 2]].sort((a, b) => b[0] - a[0]);
    const [hyp, a, b] = [d[0][0], d[1][0], d[2][0]];
    const score = Math.abs(a - b) / a + Math.abs(hyp - Math.SQRT2 * (a + b) / 2) / hyp + .4 / Math.min(...P.map(p => p.n)); if (score > .8 || score >= bs) continue;
    const tl = P[d[0][1]], o = P.filter(p => p !== tl); let [tr, bl] = o;
    if ((tr.x - tl.x) * (bl.y - tl.y) - (tr.y - tl.y) * (bl.x - tl.x) < 0) [tr, bl] = [bl, tr];
    bs = score; best = { tl, tr, bl };
  }
  return best;
}
/** Homographie: Einheitsquadrat-artige Punkte (Modulkoordinaten) → Bildpunkte, aus 4 Punktpaaren */
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) { // Gauß mit Pivotsuche
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return (x, y) => { const z = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z]; };
}
/** Ausrichtungsmuster in der Nähe der Schätzung suchen (dunkle Mitte, heller Ring, dunkler Ring); vx, vy = ein Modul in x- bzw. y-Richtung des Codes */
function findAlign(I, w, h, ex, ey, vx, vy) {
  const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= w || y >= h ? -1 : I[y * w + x]; };
  const m = (Math.hypot(...vx) + Math.hypot(...vy)) / 2, R = Math.round(m * 8), step = Math.max(1, Math.round(m / 4));
  let best = null, bs = 0;
  for (let y = ey - R; y <= ey + R; y += step) for (let x = ex - R; x <= ex + R; x += step) {
    let s = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const want = Math.max(Math.abs(dx), Math.abs(dy)) !== 1 ? 1 : 0, p = at(x + dx * vx[0] + dy * vy[0], y + dx * vx[1] + dy * vy[1]); n++; if (p === want) s++;
    }
    const sc = s / n - Math.hypot(x - ex, y - ey) / (R * 20);
    if (sc > bs) { bs = sc; best = { x, y }; }
  }
  return bs >= .8 ? best : null;
}
function sample(I, w, h, map, dim) {
  const M = [];
  for (let y = 0; y < dim; y++) { const row = []; for (let x = 0; x < dim; x++) { const [u, v] = map(x + .5, y + .5), ix = Math.round(u), iy = Math.round(v); if (ix < 0 || iy < 0 || ix >= w || iy >= h) return null; row.push(I[iy * w + ix] === 1); } M.push(row); }
  return M;
}
/** Graustufenbild (Uint8, Breite w, Höhe h) → Text oder null */
export function decodeGray(G, w, h) {
  const I = binarize(G, w, h), F = pickThree(findFinders(I, w, h)); if (!F) return null;
  const { tl, tr, bl } = F, mx = [msAlong(I, w, h, tl, tr), msAlong(I, w, h, tr, tl)].filter(Boolean), my = [msAlong(I, w, h, tl, bl), msAlong(I, w, h, bl, tl)].filter(Boolean);
  const avg = L => L.reduce((a, b) => a + b, 0) / L.length, msx = mx.length ? avg(mx) : (tl.ms + tr.ms) / 2, msy = my.length ? avg(my) : (tl.ms + bl.ms) / 2, ms = (msx + msy) / 2;
  let dim = Math.round((dist(tl, tr) / msx + dist(tl, bl) / msy) / 2) + 7;
  switch (dim & 3) { case 0: dim++; break; case 2: dim--; break; case 3: dim -= 2; break; }
  for (const d of [dim, dim + 4, dim - 4]) { // Schätzung kann um eine Version danebenliegen
    const v = (d - 17) / 4; if (!EC_M[v]) continue;
    const n = d - 7, aff = (u, vv) => [tl.x + (tr.x - tl.x) * (u - 3.5) / n + (bl.x - tl.x) * (vv - 3.5) / n, tl.y + (tr.y - tl.y) * (u - 3.5) / n + (bl.y - tl.y) * (vv - 3.5) / n];
    const tries = [];
    if (v >= 2) { const [ex, ey] = aff(d - 6.5, d - 6.5), al = findAlign(I, w, h, Math.round(ex), Math.round(ey), [(tr.x - tl.x) / n, (tr.y - tl.y) / n], [(bl.x - tl.x) / n, (bl.y - tl.y) / n]); if (al) tries.push([[d - 6.5, d - 6.5], [al.x, al.y]]); }
    tries.push([[d - 3.5, d - 3.5], [tr.x + bl.x - tl.x, tr.y + bl.y - tl.y]]);
    for (const [s4, d4] of tries) {
      const map = homography([[3.5, 3.5], [d - 3.5, 3.5], [3.5, d - 3.5], s4], [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], d4]); if (!map) continue;
      const M = sample(I, w, h, map, d); if (!M) continue;
      const t = decodeMatrix(M); if (t != null) return t;
    }
  }
  return null;
}
/** RGBA (ImageData) → Text oder null */
export function decodeImageData(img) {
  const { data, width: w, height: h } = img, G = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < G.length; i++, j += 4) G[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  return decodeGray(G, w, h);
}

/* ---------- Scanner mit der Kamera ---------- */
/** Vollbild mit Kamerabild; onText(text) beim ersten gelesenen Code (Rückgabe true = schließen). Liefert close(). */
export async function openScanner({ title = 'QR-Code scannen', hint = 'Halte den QR-Code deiner Lehrkraft in den Rahmen.', onText, onClose } = {}) {
  const ov = document.createElement('div'); ov.className = 'qs-ov';
  ov.innerHTML = `<div class="qs-top"><b>${title}</b><button type="button" class="qs-x">Abbrechen</button></div>
    <div class="qs-cam"><video playsinline muted autoplay></video><div class="qs-frame"></div></div><p class="qs-hint">${hint}</p>`;
  document.body.appendChild(ov);
  const video = ov.querySelector('video'), cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  let stream = null, alive = true, timer = 0;
  const close = () => { if (!alive) return; alive = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); ov.remove(); onClose?.(); };
  ov.querySelector('.qs-x').onclick = close;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (er) { ov.querySelector('.qs-hint').textContent = 'Die Kamera lässt sich nicht öffnen. Erlaube den Zugriff auf die Kamera (Einstellungen → Safari → Kamera) und versuche es noch einmal.'; return { close }; }
  if (!alive) { stream.getTracks().forEach(t => t.stop()); return { close }; }
  video.srcObject = stream; try { await video.play(); } catch (e) { }
  const tick = () => {
    if (!alive) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const s = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight)), w = Math.round(video.videoWidth * s), h = Math.round(video.videoHeight * s);
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      ctx.drawImage(video, 0, 0, w, h);
      let t = null; try { t = decodeImageData(ctx.getImageData(0, 0, w, h)); } catch (e) { }
      if (t) { try { navigator.vibrate?.(60); } catch (e) { } if (onText?.(t) !== false) { close(); return; } }
    }
    timer = setTimeout(tick, 120);
  };
  tick();
  return { close };
}
