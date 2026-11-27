// Probe – persönliche QR-Codes: Jede:r Schüler:in meldet sich mit einem eigenen, ausgedruckten QR-Code an.
//
// Inhalt des QR-Codes: s.html?c=<Prüfungscode>#p=<base64url({v, n, t, r, k})>
//   k: Prüfungsschlüssel (entschlüsselt die Aufgaben; kennt der Server nicht)
//   v/n: Name aus der Klassenliste, t: zufälliger persönlicher Schlüssel, r: Zugangscode zur Auswertung (Ergebniscode) –
//   beides in der Klassenliste gespeichert (verschlüsselt) und auf dem Blatt gedruckt; das iPad übernimmt r bei der Anmeldung.
//   Alles nach „#“ bleibt im Browser – es geht nie an den Server, steht also auch nicht im Server-Protokoll.
// Bei der Anmeldung steht t in der (für die Lehrkraft verschlüsselten) Identität; Probe ordnet darüber sicher zu.

import { qrMatrix } from './qr.js';
import { Pdf, PAGE_W, PAGE_H, wrap, fit, textW } from './pdf.js';
import { resultCode } from './crypto.js';

const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

export const newToken = () => b64u(crypto.getRandomValues(new Uint8Array(12)));
const nkey = r => `${r.n}|${r.v}`.toLowerCase();

/** Klassenliste neu eingelesen: Schlüssel gleicher Namen behalten (schon gedruckte QR-Codes bleiben gültig) */
export function keepTokens(oldR = [], newR = []) {
  const m = new Map(oldR.filter(r => r.t).map(r => [nkey(r), r]));
  return newR.map(r => m.has(nkey(r)) ? { ...r, t: m.get(nkey(r)).t, ...(m.get(nkey(r)).r ? { r: m.get(nkey(r)).r } : {}) } : r);
}
/** fehlende Schlüssel und Zugangscodes ergänzen; true, wenn etwas neu ist */
export function ensureTokens(R) { let ch = false; for (const r of R) { if (!r.t) { r.t = newToken(); ch = true; } if (!r.r) { r.r = resultCode(); ch = true; } } return ch; }

export function personalLink(code, r, k = '') {
  const base = new URL('s.html', location.href).href.replace(/[?#].*$/, '');
  return `${base}?c=${code}#p=${b64u(new TextEncoder().encode(JSON.stringify({ v: r.v, n: r.n, t: r.t, ...(r.r ? { r: r.r } : {}), ...(k ? { k } : {}) })))}`;
}
/** Schülerseite: persönlichen Teil aus dem Link lesen (oder null) */
export function readPersonal(hash) {
  const m = String(hash || '').match(/[#&]p=([A-Za-z0-9_-]+)/); if (!m) return null;
  try { const o = JSON.parse(new TextDecoder().decode(unb64u(m[1]))); return o && typeof o.t === 'string' && (o.v || o.n) ? { v: String(o.v || ''), n: String(o.n || ''), t: o.t.slice(0, 64), ...(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){2}$/.test(o.r || '') ? { r: o.r } : {}), ...(/^[A-Za-z0-9_-]{22}$/.test(o.k || '') ? { k: o.k } : {}) } : null; } catch (e) { return null; }
}

/** Zuordnung über den Schlüssel: Map(Anmeldung-id → Index in der Klassenliste) */
export function tokenFixed(roster, people) {
  const idx = new Map((roster || []).map((r, i) => [r.t, i]).filter(([t]) => t)), out = new Map();
  for (const p of people) if (p.t && idx.has(p.t)) out.set(p.id, idx.get(p.t));
  return out;
}

/**
 * Druckbogen: je Schüler:in ein A4-Blatt. Oben Name, Prüfung, Datum und der Zugangscode zur Auswertung, rechts oben der
 * persönliche QR-Code; darunter Karopapier (5 mm, feine graue Linien) als Schmier- und Notizblatt für die Prüfung.
 */
export function qrSheetPdf(e, R, k = '') {
  const pdf = new Pdf(`Persönliche QR-Codes ${e.klasse} ${e.fach}`);
  const MM = 72 / 25.4, M = 18 * MM, Q = 31 * MM, cell = 5 * MM;
  const datum = e.datum ? new Date(e.datum + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const titel = e.titel || `${e.fach} – ${e.art}`, sub = [e.klasse, e.fach, e.art].filter(Boolean).join(' · ');
  const site = new URL('e.html', location.href).href.replace(/[?#].*$/, '').replace(/^https?:\/\//, '');
  R.forEach((r, i) => {
    if (i) pdf.addPage();
    const qx = PAGE_W - M - Q, tw = qx - M - 16;
    // Kopf links: Name, Prüfung, Datum
    let y = M + 20;
    pdf.text(fit(`${r.v} ${r.n}`, 22, true, tw), M, y, 22, { bold: true }); y += 22;
    pdf.text(fit(titel, 12.5, false, tw), M, y, 12.5, { col: '#333333' }); y += 16;
    pdf.text(fit([sub, datum].filter(Boolean).join(' · '), 10, false, tw), M, y, 10, { col: '#666666' }); y += 22;
    // Zugangscode zur persönlichen Auswertung
    pdf.rect(M, y - 13, tw, 44, '#f3f5fa');
    pdf.text('Zugangscode zu deiner Auswertung', M + 10, y + 1, 8.5, { col: '#666666' });
    pdf.text(r.r || '–', M + 10, y + 20, 15, { bold: true, col: '#1f2a44' });
    const hint = `Nach der Korrektur einsehbar unter ${site}`;
    pdf.text(fit(hint, 8, false, tw - 20 - textW(r.r || '–', 15, true) - 14), M + tw - 10, y + 20, 8, { col: '#777777', align: 'right' });
    // QR-Code rechts oben (dunkle Module zeilenweise als Streifen)
    const QM = qrMatrix(personalLink(e.code, r, k)), c = Q / QM.length, qy = M;
    pdf.color('#000000');
    QM.forEach((row, yy) => { let s0 = -1; for (let xx = 0; xx <= row.length; xx++) { const on = xx < row.length && row[xx]; if (on && s0 < 0) s0 = xx; if (!on && s0 >= 0) { pdf.ops.push(`${(qx + s0 * c).toFixed(2)} ${(PAGE_H - qy - (yy + 1) * c).toFixed(2)} ${((xx - s0) * c).toFixed(2)} ${c.toFixed(2)} re f`); s0 = -1; } } });
    pdf.text('Zum Start scannen', qx + Q / 2, qy + Q + 11, 8, { col: '#666666', align: 'center' });
    // Karopapier: 5 mm, zentriert zwischen den Seitenrändern, feine graue Linien
    const top = Math.max(y + 31, qy + Q + 18) + 6 * MM, w = PAGE_W - 2 * M, h = PAGE_H - top - M;
    const nx = Math.floor(w / cell), ny = Math.floor(h / cell), gx = (PAGE_W - nx * cell) / 2, gy = top;
    for (let k = 0; k <= nx; k++) pdf.line(gx + k * cell, gy, gx + k * cell, gy + ny * cell, '#c9cdd6', 0.35);
    for (let k = 0; k <= ny; k++) pdf.line(gx, gy + k * cell, gx + nx * cell, gy + k * cell, '#c9cdd6', 0.35);
    pdf.text(`${r.v} ${r.n} · ${sub}`, PAGE_W / 2, PAGE_H - M / 2 + 3, 7, { col: '#a0a4ad', align: 'center' });
  });
  return pdf.bytes();
}

/** kleines Hinweis-Popup an einem Element; schließt bei Tipp daneben */
export function tip(anchor, html) {
  document.querySelectorAll('.tip-pop').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'tip-pop'; t.setAttribute('role', 'tooltip'); t.innerHTML = html;
  document.body.append(t);
  const a = anchor.getBoundingClientRect(), w = Math.min(html.length > 600 ? 420 : 340, innerWidth - 24);
  t.style.width = w + 'px';
  t.style.left = Math.max(12, Math.min(innerWidth - w - 12, a.left + a.width / 2 - w / 2)) + scrollX + 'px';
  const below = a.bottom + 8 + t.offsetHeight < innerHeight;
  t.style.top = (below ? a.bottom + 8 : a.top - 8 - t.offsetHeight) + scrollY + 'px';
  t.classList.toggle('up', !below);
  const off = ev => { if (!t.contains(ev.target) && ev.target !== anchor) { t.remove(); document.removeEventListener('pointerdown', off, true); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true));
  return t;
}
