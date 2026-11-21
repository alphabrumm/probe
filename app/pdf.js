// Probe – kleiner PDF-Schreiber (A4, Helvetica, mehrseitig, mit Zeilenumbruch). Alles im Browser, keine Bibliothek.
// Koordinaten in Punkt (1/72 Zoll), y von oben gemessen.

const WIN = { '€': 128, '‚': 130, '„': 132, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '™': 153 };
const SUBST = { '−': '-', '→': '->', '←': '<-', '⇒': '=>', '⇔': '<=>', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '√': 'Wurzel ', '∞': 'unendlich', '✓': '', '✗': '', ' ': ' ', ' ': ' ', ' ': ' ' };
const LATIN = { 'ı': 'i', 'İ': 'I', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ø': 'ø', 'ő': 'ö', 'Ő': 'Ö', 'ű': 'ü', 'Ű': 'Ü', 'ŀ': 'l', 'ħ': 'h', 'ŧ': 't', 'ə': 'e', 'Ə': 'E' };
const clean = t => String(t ?? '').replace(/[\r\t]/g, ' ').replace(/[−→←⇒⇔≤≥≠≈√∞✓✗   ]/g, c => SUBST[c]);
function pdfStr(t) {
  let o = '';
  for (const ch of clean(t)) {
    const c = ch.codePointAt(0); let b = c < 128 || (c >= 160 && c < 256) ? c : WIN[ch] ?? (/\p{M}/u.test(ch) ? null : undefined);
    if (b === undefined) { // nicht im Zeichensatz: nächster darstellbarer Buchstabe (ı → i, ş → s, ł → l, ő → ö …), sonst „?“
      const base = LATIN[ch] ?? ch.normalize('NFD').replace(/\p{M}/gu, '');
      if (base && base !== ch && [...base].every(x => { const k = x.codePointAt(0); return k < 128 || (k >= 160 && k < 256); })) { o += base.replace(/[()\\]/g, '\\$&'); continue; }
      b = 63;
    }
    if (b == null) continue; const x = String.fromCharCode(b); o += x === '(' || x === ')' || x === '\\' ? '\\' + x : x;
  }
  return '(' + o + ')';
}
function rgb(hex) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16); return [(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(v => +v.toFixed(3)).join(' '); }
let ctx;
export function textW(t, size, bold) { ctx = ctx || document.createElement('canvas').getContext('2d'); ctx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`; return ctx.measureText(clean(t)).width; }
export function fit(t, size, bold, w) { t = clean(t); if (textW(t, size, bold) <= w) return t; while (t.length > 1 && textW(t + '…', size, bold) > w) t = t.slice(0, -1); return t.trim() + '…'; }
/** Text in Zeilen der Breite w umbrechen (Absätze bleiben erhalten, überlange Wörter werden geteilt) */
export function wrap(t, size, bold, w) {
  const out = [];
  for (const para of clean(t).split('\n')) {
    let line = '';
    for (let word of para.split(/ +/)) {
      while (textW(word, size, bold) > w) { let k = word.length; while (k > 1 && textW(word.slice(0, k), size, bold) > w) k--; if (line) { out.push(line); line = ''; } out.push(word.slice(0, k)); word = word.slice(k); }
      const tr = line ? line + ' ' + word : word;
      if (textW(tr, size, bold) > w && line) { out.push(line); line = word; } else line = tr;
    }
    out.push(line);
  }
  return out;
}

export const PAGE_W = 595, PAGE_H = 842;
export class Pdf {
  constructor(title = '') { this.pages = [[]]; this.cur = 0; this.title = title; }
  get ops() { return this.pages[this.cur]; }
  addPage() { this.pages.push([]); this.cur = this.pages.length - 1; return this; }
  page(i) { this.cur = i; return this; }
  color(hex, stroke) { this.ops.push(`${rgb(hex)} ${stroke ? 'RG' : 'rg'}`); return this; }
  rect(x, y, w, h, fill, stroke, lw = 1) { if (fill) this.color(fill); if (stroke) { this.color(stroke, true); this.ops.push(`${lw} w`); } this.ops.push(`${x.toFixed(2)} ${(PAGE_H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`); return this; }
  line(x1, y1, x2, y2, col = '#999999', lw = 0.6) { this.color(col, true); this.ops.push(`${lw} w ${x1.toFixed(2)} ${(PAGE_H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - y2).toFixed(2)} l S`); return this; }
  /** Text mit Grundlinie bei y */
  text(t, x, y, size, { bold, col = '#222222', align = 'left' } = {}) {
    const w = textW(t, size, bold), xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.color(col); this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${xx.toFixed(2)} ${(PAGE_H - y).toFixed(2)} Td ${pdfStr(t)} Tj ET`); return this;
  }
  bytes() {
    const N = this.pages.length, objs = [];
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push(`<< /Type /Pages /Kids [${this.pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${N} >>`);
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    this.pages.forEach((ops, i) => {
      objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
      const cs = ops.join('\n'); objs.push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
    });
    objs.push(`<< /Title ${pdfStr(this.title)} /Producer (Probe) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const off = [];
    objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255; return b;
  }
}

/** Fließlayout: schreibt von oben nach unten und beginnt bei Bedarf eine neue Seite */
export class Flow {
  constructor(pdf, { margin = 48, top = 56, bottom = 60, onPage } = {}) { Object.assign(this, { pdf, M: margin, top, bottom, onPage }); this.y = top; this.W = PAGE_W - 2 * margin; onPage?.(this); }
  newPage() { this.pdf.addPage(); this.y = this.top; this.onPage?.(this); }
  need(h) { if (this.y + h > PAGE_H - this.bottom) this.newPage(); }
  gap(h) { this.y += h; }
  /** Absatz mit Umbruch; x und w relativ zum Rand */
  para(t, { size = 10, bold, col, x = 0, w, lh = 1.35, after = 4 } = {}) {
    const lines = wrap(t, size, bold, (w ?? this.W - x));
    for (const l of lines) { this.need(size * lh); this.y += size * lh; this.pdf.text(l, this.M + x, this.y - size * 0.28, size, { bold, col }); }
    this.y += after; return lines.length;
  }
  /** Tabelle: cols = [{ t: Überschrift, w: Breite, align }], rows = [[Zellen …] oder { cells, bold, col, fill }] */
  table(cols, rows, { size = 9.5, pad = 4, head = '#EEF0F6', zebra = '#F8F9FC', line = '#D5D9E3' } = {}) {
    const rh = size * 1.75, W = cols.reduce((s, c) => s + c.w, 0);
    const header = () => {
      this.need(rh * 2); this.pdf.rect(this.M, this.y, W, rh, head);
      let x = this.M; for (const c of cols) { this.cell(c.t, x, c.w, rh, size, { bold: true, align: c.align, pad }); x += c.w; }
      this.y += rh;
    };
    header();
    rows.forEach((r, i) => {
      const o = Array.isArray(r) ? { cells: r } : r; // (Arrays haben selbst ein .fill)
      if (this.y + rh > PAGE_H - this.bottom) { this.newPage(); header(); }
      if (o.fill || i % 2) this.pdf.rect(this.M, this.y, W, rh, o.fill || zebra);
      let x = this.M; o.cells.forEach((v, k) => { this.cell(v, x, cols[k].w, rh, size, { bold: o.bold || cols[k].bold, col: o.col, align: cols[k].align, pad }); x += cols[k].w; });
      this.y += rh;
    });
    this.pdf.line(this.M, this.y, this.M + W, this.y, line); this.y += 6;
  }
  cell(v, x, w, h, size, { bold, col, align = 'left', pad = 4 }) {
    const t = fit(v ?? '', size, bold, w - 2 * pad), ty = this.y + h / 2 + size * 0.35;
    this.pdf.text(t, align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : x + pad, ty, size, { bold, col, align });
  }
}

/** PDF anzeigen: neuer Tab (iPad: Teilen → Sichern/Drucken), sonst Download */
export function showPdf(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const w = window.open(url, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}
