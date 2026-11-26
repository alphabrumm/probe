// Probe – handschriftliche Aufgaben: Korrektur-Anmerkungen (grün) über dem Foto anzeigen, Stempelwerte, Musterlösung.
// Gemeinsam für Auswertung (run.js), Korrekturdialog (handkorr.js), Respizienz (resp.js) und Ergebnisseite (result.js).
// Anmerkung ann = { w, h, s: [[x,y,x,y,…], …] (freie Striche), st: [{ id, k, x, y, adj }] (Stempel), man?: Punkte von Hand }
// Koordinaten in Bildpixeln (w × h). Werte der Stempel hängen vom Modus der Aufgabe ab (additiv/subtraktiv).
import { renderMath, MATH_CSS } from '../vendor/pathfinder/core/pfmath.js';
export { renderMath };

export const GREEN = '#139a43';
export const IMG_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export const STAMPS = [['ok', 'Haken – korrekt'], ['x', 'X – nicht korrekt'], ['ring', 'unterringelt – ungenau'], ['miss', 'fehlt'], ['kons', 'Konsequenzfehler'], ['a', 'Ausdruck']];
// Startwert und ob es ▲▼ gibt – je Modus
const BASE = { sub: { ok: null, x: -1, ring: null, miss: -1, kons: -1, a: null }, add: { ok: 1, x: null, ring: null, miss: null, kons: null, a: null } };
const ARW = { sub: { ok: false, x: true, ring: false, miss: true, kons: true, a: true }, add: { ok: true, x: true, ring: false, miss: true, kons: true, a: true } };
export const hasArrows = (k, mode) => !!ARW[mode]?.[k];
/** Wert eines Stempels in der Punktespalte (null = kein Eintrag) */
export function stampVal(st, mode) {
  const b = BASE[mode]?.[st.k] ?? null;
  if (!ARW[mode]?.[st.k]) return b;
  return b == null && !st.adj ? null : (b ?? 0) + (st.adj || 0);
}
/** Punkte aus den Stempeln: subtraktiv = Höchstpunkte + Abzüge, additiv = Summe; null = nichts zu rechnen */
export function annTotal(ann, mode, max) {
  if (!ann || !ann.st?.length) return null;
  const vs = ann.st.map(s => stampVal(s, mode)).filter(v => v != null);
  if (mode !== 'sub' && !vs.length) return null;
  const sum = vs.reduce((a, b) => a + b, 0), t = mode === 'sub' ? max + sum : sum;
  return Math.max(0, Math.min(max, Math.round(t * 2) / 2));
}
export const fmtV = v => (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(v)).replace('.', ',');

/** Stempel als SVG-Gruppe (Mittelpunkt x,y; u = Größe) */
export function stampSvg(k, x, y, u, extra = '') {
  const P = {
    ok: 'M-.5 .02 L-.14 .42 L.56 -.5',
    x: 'M-.42 -.42 L.42 .42 M.42 -.42 L-.42 .42',
    ring: 'M-1.1 .1 q.275 .32 .55 0 t.55 0 t.55 0 t.55 0',
    miss: 'M-.42 -.5 L0 .48 L.42 -.5 M-.62 .18 L.62 -.2',
    kons: 'M-.28 .02 L.26 -.6 M-.5 .42 H.48 M.3 .26 L.5 .42 L.3 .58',
    a: 'M-.4 .52 L0 -.52 L.4 .52 M-.24 .14 H.24',
  }[k] || '';
  return `<g transform="translate(${x} ${y}) scale(${u})"${extra}><path d="${P}" fill="none" stroke="${GREEN}" stroke-width=".11" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
export const stampIcon = k => `<svg viewBox="-0.75 -0.75 1.5 1.5" width="26" height="26" aria-hidden="true">${stampSvg(k === 'ring' ? 'ring' : k, 0, 0, k === 'ring' ? 0.6 : 1)}</svg>`;
export const unit = ann => Math.max(12, (ann.w || 1000) * 0.045);
/** Striche und Stempel als SVG-Inhalt */
export function annSvgInner(ann) {
  const lw = Math.max(2, (ann.w || 1000) * 0.0035), u = unit(ann);
  return (ann.s || []).map(p => `<polyline points="${p.join(' ')}" fill="none" stroke="${GREEN}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')
    + (ann.st || []).map(s => stampSvg(s.k, s.x, s.y, u)).join('');
}
/**
 * Nur ansehen: Foto mit Anmerkungen und Punktespalte rechts daneben (Werte auf Höhe ihres Stempels).
 * vals: [{ y, v }] – fertige Werte (Ergebnisseite) oder aus ann + mode berechnet
 */
export function annViewHtml(img, ann, mode, { link = true } = {}) {
  if (!IMG_RE.test(img || '')) return '';
  const pic = `<img src="${img}" alt="Handschriftliche Lösung">`;
  if (!ann || !ann.w || (!ann.s?.length && !ann.st?.length)) return link ? `<a class="hand-ans" href="${img}" target="_blank" rel="noopener" title="groß ansehen">${pic}</a>` : `<div class="hand-ans">${pic}</div>`;
  const vals = (ann.st || []).map(s => ({ y: s.y, v: s.v !== undefined ? s.v : stampVal(s, mode) })).filter(x => x.v != null);
  return `<div class="hk-view"><div class="hk-pic">${pic}<svg viewBox="0 0 ${ann.w} ${ann.h}" preserveAspectRatio="none" aria-hidden="true">${annSvgInner(ann)}</svg></div>`
    + `<div class="hk-col">${vals.map(x => `<span class="${x.v < 0 ? 'neg' : x.v > 0 ? 'pos' : ''}" style="top:${(100 * x.y / ann.h).toFixed(2)}%">${fmtV(x.v)}</span>`).join('')}</div></div>`;
}
/** für die Ergebnisseite: Anmerkung mit fertigen Werten (der Schüler braucht den Modus nicht) */
export function annForReport(ann, mode) {
  if (!ann || !ann.w) return null;
  return { w: ann.w, h: ann.h, s: ann.s || [], st: (ann.st || []).map(s => ({ k: s.k, x: s.x, y: s.y, v: stampVal(s, mode) })) };
}
export const solutionHtml = sol => sol ? `<div class="hk-solbox"><b>Musterlösung</b><div>${renderMath(sol)}</div></div>` : '';
let css = false;
export function ensureCss() {
  if (css) return; css = true;
  const st = document.createElement('style');
  st.textContent = MATH_CSS + `
.hk-view{display:flex;align-items:flex-start;gap:0;max-width:720px}
.hk-pic{position:relative;line-height:0;flex:0 1 auto;min-width:0}
.hk-pic img{display:block;max-width:100%;height:auto;border:1px solid var(--line,#ccc);border-radius:10px;background:#fff}
.hk-pic svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.hk-col{position:relative;align-self:stretch;width:56px;flex:none;border-left:2px dashed ${GREEN}55;margin-left:6px}
.hk-col span{position:absolute;left:6px;transform:translateY(-50%);font-weight:800;font-size:15px;color:${GREEN};line-height:1;white-space:nowrap}
.hk-solbox{margin:8px 0;padding:8px 12px;border-radius:10px;background:color-mix(in srgb,${GREEN} 9%,transparent);border:1px solid color-mix(in srgb,${GREEN} 30%,transparent)}
.hk-solbox>b{display:block;margin-bottom:4px;color:${GREEN}}`;
  document.head.append(st);
}
