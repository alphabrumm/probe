// Probe – QR-Code ohne Bibliothek: Byte-Modus (UTF-8), Fehlerkorrektur M, Versionen 1–10 (bis 213 Zeichen).
// Aufbau nach ISO/IEC 18004 (Vorgehen wie bei Nayukis „QR Code generator“). Ergebnis: Matrix oder SVG.

const EC_M = { // Version: [Fehlerkorrektur-Bytes je Block, [[Anzahl Blöcke, Datenbytes je Block], …]]
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const dataCap = v => EC_M[v][1].reduce((s, [n, d]) => s + n * d, 0);

function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
function rsDivisor(deg) { const r = Array(deg - 1).fill(0).concat([1]); let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); } return r; }
function rsRemainder(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); } return r; }

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let v = 1; while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCap(v) * 8) v++;
  if (v > 10) throw new Error('Text zu lang für den QR-Code');
  // Bitfolge: Modus, Länge, Daten, Abschluss, Füllbytes
  const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  const cap = dataCap(v) * 8; put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
  for (let p = 0xEC; data.length < dataCap(v); p ^= 0xEC ^ 0x11) data.push(p);
  // Blöcke mit Fehlerkorrektur, verschränkt
  const [ecLen, groups] = EC_M[v], div = rsDivisor(ecLen), blocks = []; let k = 0;
  for (const [n, d] of groups) for (let i = 0; i < n; i++) { const dat = data.slice(k, k + d); k += d; blocks.push({ dat, ec: rsRemainder(dat, div) }); }
  const out = [], maxD = Math.max(...blocks.map(b => b.dat.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.dat.length) out.push(b.dat[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ec[i]);

  const size = v * 4 + 17, M = Array.from({ length: size }, () => Array(size).fill(false)), F = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  // Suchmuster mit Rand, Taktlinien, Ausrichtungsmuster
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const A = ALIGN[v];
  for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === A.length - 1) || (i === A.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(A[i] + dx, A[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = mask => {
    const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, d); set(c, a, d); } }
  // Daten im Zickzack
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!F[y][x] && bi < out.length * 8) { M[y][x] = ((out[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1; bi++; }
    }
  }
  // Maske mit der geringsten Strafpunktzahl
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let a = 0; a < 2; a++) for (let i = 0; i < size; i++) { let run = 1; for (let j = 1; j <= size; j++) { const cur = j < size ? (a ? M[j][i] : M[i][j]) : null, prev = a ? M[j - 1][i] : M[i][j - 1]; if (cur === prev) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], tap = pat.slice().reverse();
    for (let a = 0; a < 2; a++) for (let i = 0; i < size; i++) for (let j = 0; j + 11 <= size; j++) { let m1 = true, m2 = true; for (let k = 0; k < 11; k++) { const c = (a ? M[j + k][i] : M[i][j + k]) ? 1 : 0; if (c !== pat[k]) m1 = false; if (c !== tap[k]) m2 = false; } if (m1 || m2) p += 40; }
    for (const row of M) for (const c of row) if (c) dark++;
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { apply(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } apply(m); }
  apply(best); drawFormat(best);
  return M;
}

/** QR-Code als SVG (schwarz auf weiß, mit Ruhezone) */
export function qrSvg(text, { quiet = 4, title = '' } = {}) {
  const M = qrMatrix(text), n = M.length + 2 * quiet; let d = '';
  M.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img"${title ? ` aria-label="${title.replace(/"/g, '')}"` : ''}><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
