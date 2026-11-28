// QR-Leser des Players (app/qrscan.js) testen: node tools/test-qrscan.mjs – erzeugt Codes mit app/qr.js, auch als verzerrte, verrauschte Bilder.
// Erwartet: alle Matrizen; Bilder ab Version 5 (die Links von Probe) auch schräg; Version 1 und sehr starke Perspektive dürfen fehlschlagen.
import { qrMatrix } from '../app/qr.js';
import { decodeMatrix, decodeGray, rsDecode } from '../app/qrscan.js';
const texts = ['https://coach.pandapy.de/play.html#u=12.AbCdEfGhIjKlMnOpQrStUv.ZyXwVuTsRqPoNmLkJiHgFe.Anna%7CAlm',
  'https://probe.beispielschule.de/play.html#t=3.AbCdEfGhIjKlMnOpQrStUv.ZyXwVuTsRqPoNmLkJiHgFe', 'hi', 'x'.repeat(150), 'Ä'.repeat(60)];
let ok = 0, n = 0;
for (const t of texts) { const M = qrMatrix(t); n++; if (decodeMatrix(M) === t) ok++; else console.log('Matrix FAIL', M.length, t.slice(0, 30)); }
// Fehler einbauen: einige Module kippen
for (const t of texts) { const M = qrMatrix(t).map(r => r.slice()); const s = M.length; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 12; i++) { const x = 9 + Math.floor(rnd() * (s - 18)), y = 9 + Math.floor(rnd() * (s - 18)); M[y][x] = !M[y][x]; }
  n++; if (decodeMatrix(M) === t) ok++; else console.log('Matrix+Fehler FAIL', s); }
// Bild mit Perspektive, Unschärfe, Rauschen, ungleichmäßigem Licht
function render(M, { W = 640, H = 480, rot = 0.3, persp = 0.0004, scale = 7, noise = 30, light = 60 } = {}) {
  const s = M.length, q = 4; scale = scale * 330 / 7 / (s + 2 * q); const tot = (s + 2 * q) * scale, G = new Uint8Array(W * H);
  const cx = W / 2, cy = H / 2, c = Math.cos(rot), sn = Math.sin(rot); let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let u = x - cx, v = y - cy; const z = 1 + persp * u; u /= z; v /= z;
    const a = c * u + sn * v + tot / 2, b = -sn * u + c * v + tot / 2;
    const mx = Math.floor(a / scale) - q, my = Math.floor(b / scale) - q;
    let val = 200; if (mx >= 0 && my >= 0 && mx < s && my < s && M[my][mx]) val = 40;
    val += (x / W) * light - light / 2 + (rnd() - .5) * noise;
    G[y * W + x] = Math.max(0, Math.min(255, val));
  }
  // leichte Unschärfe (3x3)
  const O = new Uint8Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += G[(y + dy) * W + x + dx]; O[y * W + x] = sum / 9; }
  return O;
}
const cfgs = [{}, { rot: 0 }, { rot: 1.2, persp: 0.0006 }, { rot: -0.4, scale: 5 }, { rot: 2.5, scale: 6, noise: 50 }, { rot: 0.1, persp: -0.0008, scale: 8 }, { rot: 3.1, scale: 4.5, light: 120 }, { rot: 0.7, persp: 0.0012 }, { rot: 0.2, persp: 0, scale: 3.6 }];
for (const t of texts.slice(0, 4)) for (const cfg of cfgs) { const M = qrMatrix(t); n++; const t0 = Date.now(); const r = decodeGray(render(M, cfg), 640, 480); if (r === t) ok++; else console.log('Bild FAIL v' + (M.length - 17) / 4, JSON.stringify(cfg)); }
console.log(`${ok}/${n} ok`);
