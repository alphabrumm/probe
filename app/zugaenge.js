// Probe – Startpasswörter für mehrere Lehrkräfte: Textliste zum Kopieren und PDF mit einem Zettel je Lehrkraft (4 je Seite, zum Ausschneiden).
import { Pdf, PAGE_W, PAGE_H, fit } from './pdf.js';
import { qrMatrix } from './qr.js';

const INK = '#1F2340', GREY = '#6B7085', ACC = '#3B4FC4';

/** list: [{ kuerzel, name, pw, had }] – had = Konto war schon eingerichtet (dann Wiederherstellungscode eingeben) */
export function zugangText(list, url) {
  const w1 = Math.max(6, ...list.map(x => x.kuerzel.length)), w2 = Math.max(4, ...list.map(x => (x.name || '').length));
  return [`Probe – Startpasswörter (${new Date().toLocaleDateString('de-DE')})`, `Anmeldung: ${url}`, 'Jedes Startpasswort gilt nur bis zur ersten Anmeldung.', '',
    `${'Kürzel'.padEnd(w1)}  ${'Name'.padEnd(w2)}  Startpasswort`, ...list.map(x => `${x.kuerzel.padEnd(w1)}  ${(x.name || '').padEnd(w2)}  ${x.pw}`)].join('\n');
}

function qr(pdf, text, x, y, size) {
  const M = qrMatrix(text), n = M.length + 4, s = size / n;
  pdf.rect(x, y, size, size, '#FFFFFF');
  pdf.color('#000000');
  M.forEach((row, r) => { let c = 0; while (c < row.length) { if (!row[c]) { c++; continue; } let e = c; while (e < row.length && row[e]) e++; pdf.ops.push(`${(x + (c + 2) * s).toFixed(2)} ${(PAGE_H - y - (r + 3) * s).toFixed(2)} ${((e - c) * s).toFixed(2)} ${s.toFixed(2)} re f`); c = e; } });
}

export function zugangPdf(list, url) {
  const pdf = new Pdf('Probe – Startpasswörter'), M = 40, per = 4, H = (PAGE_H - 2 * M) / per, W = PAGE_W - 2 * M;
  list.forEach((x, i) => {
    if (i && i % per === 0) pdf.addPage();
    const top = M + (i % per) * H, q = 96;
    if (i % per) { pdf.ops.push('[5 4] 0 d'); pdf.line(M - 20, top, PAGE_W - M + 20, top, '#B8BCC8', 0.6); pdf.ops.push('[] 0 d'); }
    let y = top + 26;
    pdf.text('Probe – dein Zugang', M + 6, y, 9, { bold: true, col: ACC }); y += 20;
    pdf.text(fit(x.name ? `${x.name} (${x.kuerzel})` : x.kuerzel, 15, true, W - q - 30), M + 6, y, 15, { bold: true, col: INK }); y += 22;
    const row = (k, v, size = 11, bold = false) => { pdf.text(k, M + 6, y, 9, { col: GREY }); pdf.text(fit(v, size, bold, W - q - 120), M + 100, y, size, { bold, col: INK }); y += size + 8; };
    row('Adresse', url); row('Kürzel', x.kuerzel, 12, true); row('Startpasswort', x.pw, 15, true);
    const steps = ['1. Adresse öffnen (oder QR-Code scannen), mit Kürzel und Startpasswort anmelden.', '2. Eigenes Passwort festlegen. Das Startpasswort gilt nur bis zur ersten Anmeldung.',
      x.had ? '3. Wiederherstellungscode eingeben – dann bleiben deine Prüfungen lesbar.' : '3. Den Wiederherstellungscode ausdrucken oder sicher aufschreiben.'];
    y += 2; for (const s of steps) { pdf.text(fit(s, 8.5, false, W - q - 20), M + 6, y, 8.5, { col: GREY }); y += 11.5; }
    qr(pdf, url, PAGE_W - M - q, top + 22, q);
    pdf.text(fit(url.replace(/^https?:\/\//, '').replace(/\/$/, ''), 7.5, false, q + 20), PAGE_W - M - q / 2, top + 22 + q + 12, 7.5, { col: GREY, align: 'center' });
  });
  return pdf.bytes();
}
