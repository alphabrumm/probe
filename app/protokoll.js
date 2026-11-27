// Probe – Prüfungsprotokoll als PDF: Übersicht (Notenschlüssel, Verteilung, Ergebnisse, Aufgaben) und je Prüfling eine Seite.
// Entsteht im Browser der Lehrkraft aus der entschlüsselten Auswertung.
import { Pdf, Flow, PAGE_H, PAGE_W, fit, toJpeg } from './pdf.js';

const TYP = { quiz: 'Quiz', gap: 'Lückentext', match: 'Zuordnen', essay: 'Freitext', mark: 'Markieren', sort: 'Sortieren', order: 'Reihenfolge' };
const plain = h => String(h ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/<sup>(.*?)<\/sup>/gi, '^$1').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const INK = '#1F2340', GREY = '#6B7085', GOOD = '#2F8A5B', BAD = '#C0392B', ACC = '#3B4FC4';

/**
 * @param S2  Auswertungs-Zustand aus run.js ({ e, key, g, people, M })
 * @param RS  results(): [{ p, R, note }]
 * @param X   Hilfen (fmtPts, fmtDate, S)
 */
export async function protokollPdf(S2, RS, X) {
  const { e, key, g } = S2, { fmtPts, fmtDate } = X, pts = e.skala === 'punkte';
  const doc = S2.doc || e.draft || null, imgs = doc ? await examImages(doc) : new Map();
  const noteLabel = pts ? 'Punkte (0–15)' : 'Note', lk = S2.lehrkraft || [X.S.user?.name, X.S.user?.kuerzel && `(${X.S.user.kuerzel})`].filter(Boolean).join(' ');
  const max = RS[0]?.R.max ?? key.tasks.reduce((s, t) => s + (g.drop.includes(t.id) ? 0 : t.pts), 0);
  const head = `${e.klasse} · ${e.fach} · ${e.art} · ${fmtDate(e.datum)}`;
  const pdf = new Pdf(`Prüfungsprotokoll ${head}`);
  const F = new Flow(pdf, {
    onPage: f => { // Kopfzeile auf jeder Seite
      pdf.text('Prüfungsprotokoll', f.M, 34, 8.5, { bold: true, col: ACC });
      pdf.text(fit(head + (e.titel ? ' · ' + e.titel : ''), 8.5, false, f.W - 110), PAGE_W - f.M, 34, 8.5, { col: GREY, align: 'right' });
      pdf.line(f.M, 40, PAGE_W - f.M, 40, '#C9CEDB', 0.6);
    },
  });

  /* ---------- Übersicht ---------- */
  F.y = 62;
  pdf.text('Prüfungsprotokoll', F.M, F.y + 16, 22, { bold: true, col: INK }); F.y += 30;
  pdf.text(`${e.klasse} · ${e.fach} · ${e.art}`, F.M, F.y + 12, 13, { bold: true, col: INK }); F.y += 18;
  if (e.titel) F.para(e.titel, { size: 11, col: INK, after: 2 });
  const open = RS.reduce((s, x) => s + x.R.pending, 0), avg = RS.length ? RS.reduce((s, x) => s + x.note, 0) / RS.length : 0;
  const meta = [['Datum', fmtDate(e.datum)], ['Schuljahr', e.schuljahr], ['Lehrkraft', lk || '–'], ['Teilnehmer', String(RS.length)],
    ['Höchstpunktzahl', `${fmtPts(max)} Punkte`], ['Durchschnitt', RS.length ? `${avg.toFixed(2).replace('.', ',')}${pts ? ' Punkte' : ''}` : '–'],
    ['Bewertung', open ? `${open} Freitext-Antwort${open === 1 ? '' : 'en'} noch offen` : 'vollständig'], ['Stand', new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })]];
  F.gap(4);
  for (let i = 0; i < meta.length; i += 2) {
    F.y += 15;
    meta.slice(i, i + 2).forEach(([k, v], j) => { const x = F.M + j * (F.W / 2); pdf.text(k, x, F.y, 9, { col: GREY }); pdf.text(fit(v, 10, true, F.W / 2 - 100), x + 92, F.y, 10, { bold: true, col: k === 'Bewertung' && open ? BAD : INK }); });
  }
  if (S2.respizienz) { F.y += 15; pdf.text('Respizienz', F.M, F.y, 9, { col: GREY }); pdf.text(fit(S2.respizienz, 10, true, F.W - 100), F.M + 92, F.y, 10, { bold: true, col: GOOD }); }
  F.gap(14);

  // Notenschlüssel und Verteilung
  const grades = pts ? Array.from({ length: 16 }, (_, i) => 15 - i) : [1, 2, 3, 4, 5, 6];
  const from = n => { // ab wie viel Prozent gibt es Note/Punkte n?
    if (pts) return n === 0 ? 0 : g.gkey[n - 1];
    return n === 6 ? 0 : g.gkey[5 - n];
  };
  const cnt = n => RS.filter(x => x.note === n).length;
  const section = t => { F.need(40); F.gap(6); pdf.text(t, F.M, F.y + 12, 12.5, { bold: true, col: INK }); F.y += 20; };
  section('Notenschlüssel und Verteilung');
  const gw = Math.min(62, (F.W - 92) / grades.length);
  const gcols = [{ t: '', w: 92, bold: true }, ...grades.map(n => ({ t: pts ? `${n}` : `Note ${n}`, w: gw, align: 'center' }))];
  F.table(gcols, [
    ['ab Prozent', ...grades.map(n => `${from(n)} %`)],
    ['ab Punkten', ...grades.map(n => fmtPts(Math.ceil(max * from(n) / 100 * 2) / 2))],
    { cells: ['Anzahl', ...grades.map(n => String(cnt(n)))], bold: true },
  ], { size: pts ? 8 : 9.5 });

  // Ergebnisse
  section('Ergebnisse');
  const W = F.W, cw = [26, 0, 70, 40, 64, 0]; cw[5] = 120; cw[1] = W - cw.reduce((s, x) => s + x, 0);
  F.table([{ t: 'Nr.', w: cw[0], align: 'right' }, { t: 'Name', w: cw[1] }, { t: 'Punkte', w: cw[2], align: 'right' }, { t: '%', w: cw[3], align: 'right' }, { t: noteLabel, w: cw[4], align: 'center', bold: true }, { t: 'Hinweise', w: cw[5] }],
    RS.map((x, i) => [String(i + 1), `${x.p.n}, ${x.p.v}`, `${fmtPts(x.R.total)} / ${fmtPts(x.R.max)}`, String(Math.round(x.R.pct)), String(x.note),
      [x.p.imported ? 'Abgabe per Datei' : '', x.p.fokus ? `${x.p.fokus}× Fokus verlassen` : '', x.R.pending ? `${x.R.pending} offen` : ''].filter(Boolean).join(', ')]));

  // Aufgaben
  section('Aufgaben');
  const tw = [26, 0, 82, 56, 56]; tw[1] = W - tw.reduce((s, x) => s + x, 0);
  F.table([{ t: 'Nr.', w: tw[0], align: 'right' }, { t: 'Aufgabe', w: tw[1] }, { t: 'Typ', w: tw[2] }, { t: 'max. P.', w: tw[3], align: 'right' }, { t: 'Ø P.', w: tw[4], align: 'right' }],
    key.tasks.map((t, i) => {
      const drop = g.drop.includes(t.id), its = RS.map(x => x.R.items[i]), a = its.length ? its.reduce((s, x) => s + (x.pts || 0), 0) / its.length : 0;
      return { cells: [String(i + 1), plain(t.title), (t.type === 'order' && t.words ? 'Satzpuzzle' : TYP[t.type]) || (t.short ? 'kurze Antwort' : 'freie Antwort'), fmtPts(t.pts), drop ? 'gestrichen' : fmtPts(Math.round(a * 10) / 10)], col: drop ? GREY : undefined };
    }));

  // Unterschrift
  F.need(44); F.gap(30);
  pdf.line(F.M, F.y, F.M + 200, F.y, '#888888', 0.6); pdf.line(F.M + 260, F.y, F.M + F.W, F.y, '#888888', 0.6);
  pdf.text('Ort, Datum', F.M, F.y + 11, 8.5, { col: GREY }); pdf.text('Unterschrift Lehrkraft', F.M + 260, F.y + 11, 8.5, { col: GREY });

  /* ---------- die Prüfung selbst, mit Musterlösung ---------- */
  if (doc) { F.newPage(); F.y = 58; examSection(F, pdf, doc, imgs, fmtPts); }

  /* ---------- je Prüfling eine Seite ---------- */
  for (const x of RS) {
    F.newPage(); F.y = 58;
    pdf.text(fit(`${x.p.n}, ${x.p.v}`, 16, true, F.W - 150), F.M, F.y + 14, 16, { bold: true, col: INK });
    pdf.text(`${pts ? '' : 'Note '}${x.note}${pts ? ' Punkte' : ''}`, PAGE_W - F.M, F.y + 14, 16, { bold: true, col: ACC, align: 'right' }); F.y += 24;
    F.para(`${fmtPts(x.R.total)} von ${fmtPts(x.R.max)} Punkten (${Math.round(x.R.pct)} %)${x.p.imported ? ' · Abgabe per Datei' : ''}${x.p.fokus ? ` · ${x.p.fokus}× Fokus verlassen` : ''}${x.R.pending ? ` · ${x.R.pending} Antwort${x.R.pending === 1 ? '' : 'en'} noch nicht bewertet` : ''}`, { size: 10, col: GREY, after: 8 });
    const fb = g.feedback[x.p.id] || {};
    key.tasks.forEach((t, i) => {
      const it = x.R.items[i];
      F.need(40); F.gap(4); pdf.line(F.M, F.y, PAGE_W - F.M, F.y, '#E1E4EC', 0.6); F.y += 15;
      pdf.text(fit(`${i + 1}. ${plain(t.title)}`, 11, true, F.W - 110), F.M, F.y, 11, { bold: true, col: INK });
      pdf.text(it.dropped ? 'gestrichen' : it.pts == null ? `? / ${fmtPts(t.pts)} P.` : `${fmtPts(it.pts)} / ${fmtPts(t.pts)} P.`, PAGE_W - F.M, F.y, 11, { bold: true, col: it.dropped ? GREY : it.pts == null ? BAD : INK, align: 'right' });
      F.y += 5;
      if (it.answer) F.para('Antwort: ' + it.answer, { size: 9.5, x: 6, col: INK, after: 2 });
      for (const p of it.parts || []) {
        const line = `${p.label}: ${p.given || '–'}${p.ok ? '' : `   (richtig: ${p.expected})`}`;
        F.need(14); pdf.text(p.ok ? 'richtig' : 'falsch', F.M + 6, F.y + 11, 8.5, { bold: true, col: p.ok ? GOOD : BAD });
        F.para(line, { size: 9.5, x: 52, after: 0, col: INK });
      }
      if (!it.auto || it.text != null) {
        F.para(it.text ? it.text : '– keine Antwort –', { size: it.type === 'app' ? 8.5 : 10, x: 6, col: it.text ? INK : GREY, after: 2 });
        if (t.rubric?.length) F.para('Erwartung: ' + t.rubric.map(r => `${plain(r.t)} (${fmtPts(r.p)})`).join(' · '), { size: 8.5, x: 6, col: GREY, after: 0 });
      }
      if (it.overridden) F.para('Punkte von der Lehrkraft angepasst.', { size: 8.5, x: 6, col: GREY, after: 0 });
      if (fb[t.id]) F.para('Rückmeldung: ' + fb[t.id], { size: 9.5, x: 6, col: ACC, after: 0 });
      F.gap(4);
    });
  }

  // Fußzeile „Seite i von n“ (die Prüfung selbst steht nach der Übersicht, vor den Prüflingen)
  const N = pdf.pages.length;
  for (let i = 0; i < N; i++) { pdf.page(i); pdf.text(`Seite ${i + 1} von ${N}`, PAGE_W - F.M, PAGE_H - 30, 8.5, { col: GREY, align: 'right' }); pdf.text('Erstellt mit Probe – vertraulich, enthält Schülerdaten', F.M, PAGE_H - 30, 8.5, { col: GREY }); }
  return pdf.bytes();
}

/* ---------- Prüfung mit Musterlösung (Text, Bilder; ohne Formatierung) ---------- */
const TASKS = new Set(['task', 'quiz', 'gap', 'match', 'essay', 'mark', 'sort', 'order', 'app']);
const imgOf = b => b.type === 'image' ? b.src : TASKS.has(b.type) ? b.img : '';
async function examImages(doc) {
  const m = new Map();
  for (const st of doc.stations || []) for (const b of st.blocks || []) { const s = imgOf(b); if (s && !m.has(s)) m.set(s, await toJpeg(s)); }
  return m;
}
function examSection(F, pdf, doc, imgs, fmtPts) {
  const SOL = '#2F8A5B';
  pdf.text('Prüfung mit Musterlösung', F.M, F.y + 16, 18, { bold: true, col: INK }); F.y += 26;
  if (doc.title) F.para(plain(doc.title), { size: 11, col: INK, after: 6 });
  const img = (src, maxW = F.W * 0.7, maxH = 260) => {
    const j = src && imgs.get(src); if (!j) { if (src) F.para('[Bild]', { size: 8.5, col: GREY, after: 2 }); return; }
    const s = Math.min(maxW / j.w, maxH / j.h, 1.2), w = j.w * s, h = j.h * s; F.need(h + 8); F.y += 4; pdf.image(j, F.M + 6, F.y, w, h); F.y += h + 6;
  };
  const sol = (t, o = {}) => F.para(t, { size: 9.5, x: 6, col: SOL, after: 2, ...o });
  const txt = (t, o = {}) => { const p = plain(t); if (p) F.para(p, { size: 10, x: 6, col: INK, after: 3, ...o }); };
  let n = 0;
  for (const st of doc.stations || []) {
    if (st.title && (doc.stations.length > 1 || plain(st.title))) { F.need(40); F.gap(6); F.para(plain(st.title), { size: 12.5, bold: true, col: INK, after: 4 }); }
    for (const b of st.blocks || []) {
      if (!TASKS.has(b.type)) {
        if (b.type === 'text') txt(b.html, /^h[34]$/.test(b.tag || '') ? { bold: true, size: 11 } : {});
        else if (b.type === 'info') txt((b.title ? plain(b.title) + ': ' : '') + plain(b.html));
        else if (b.type === 'image') { img(b.src); if (b.caption) F.para(plain(b.caption), { size: 8.5, x: 6, col: GREY, after: 3 }); }
        else if (b.type === 'table') (b.rows || []).forEach(r => F.para(r.map(plain).join('  |  '), { size: 9, x: 6, col: INK, after: 1 }));
        else if (b.type === 'code') F.para(b.code || '', { size: 8.5, x: 6, col: INK, after: 3 });
        else if (b.type === 'reveal') txt((b.summary ? plain(b.summary) + ': ' : '') + plain(b.html));
        continue;
      }
      n++;
      F.need(46); F.gap(6); pdf.line(F.M, F.y, PAGE_W - F.M, F.y, '#E1E4EC', 0.6); F.y += 15;
      const title = plain(b.title || b.qs?.[0]?.q || '') || 'Aufgabe';
      pdf.text(fit(`${n}. ${title}`, 11, true, F.W - 90), F.M, F.y, 11, { bold: true, col: INK });
      pdf.text(`${fmtPts(+(b.pts ?? 1) || 0)} P.`, PAGE_W - F.M, F.y, 11, { bold: true, col: INK, align: 'right' }); F.y += 6;
      img(b.img);
      if (b.type === 'gap') { txt(String(b.html || '').replace(/\[\[(.*?)\]\]/g, '____')); sol('Lösung: ' + [...String(b.html || '').matchAll(/\[\[(.*?)\]\]/g)].map((m, i) => `(${i + 1}) ${plain(m[1]).split('|').join(' / ')}`).join('   ')); if (b.extra?.length) F.para('Ablenker: ' + b.extra.map(plain).join(', '), { size: 8.5, x: 6, col: GREY, after: 2 }); continue; }
      if (b.type === 'mark') { txt(String(b.html || '').replace(/\{\{(.*?)\}\}/g, '$1')); sol('Zu markieren: ' + [...String(b.html || '').matchAll(/\{\{(.*?)\}\}/g)].map(m => plain(m[1])).join(', ')); continue; }
      txt(b.html);
      if (b.type === 'quiz') (b.qs || []).forEach(q => { if ((b.qs || []).length > 1 || plain(q.q) !== title) F.para(plain(q.q), { size: 10, x: 6, bold: true, col: INK, after: 1 }); (q.opts || []).forEach(o => F.para(`${o.ok ? '[x]' : '[  ]'} ${plain(o.t)}`, { size: 9.5, x: 14, col: o.ok ? SOL : INK, bold: !!o.ok, after: 0 })); F.gap(3); });
      else if (b.type === 'match') (b.pairs || []).forEach(p => sol(`${plain(p.a)}  ->  ${plain(p.b)}`, { after: 0 }));
      else if (b.type === 'sort') (b.groups || []).forEach(gr => sol(`${plain(gr.name)}: ${(gr.items || []).map(plain).join(', ')}`, { after: 0 }));
      else if (b.type === 'order') { sol('Richtige Reihenfolge: ' + (b.words ? (b.items || []).map(plain).join(' ') : ''), { after: 0 }); if (!b.words) (b.items || []).forEach((t, i) => sol(`${i + 1}. ${plain(t)}`, { x: 14, after: 0 })); if (b.alts?.length) F.para(`(${b.alts.length} weitere Reihenfolge${b.alts.length > 1 ? 'n' : ''} ebenfalls richtig)`, { size: 8.5, x: 6, col: GREY, after: 0 }); }
      else if (b.type === 'task') { if (b.answer) sol('Lösung: ' + b.answer.split('|').map(plain).join(' oder ')); }
      if (b.type === 'essay' && b.hand) F.para('Handschriftlich (Foto der Lösung auf Papier)', { size: 8.5, x: 6, col: GREY, after: 2 });
      if (b.type === 'app' && b.expect) sol('Erwartete Ausgabe: ' + plain(b.expect));
      if (b.rubric?.length) sol('Erwartung: ' + b.rubric.map(r => `${plain(r.t)} (${fmtPts(+r.p || 0)} P.)`).join(' · '));
      if (b.solution) sol('Musterlösung: ' + plain(b.solution));
      F.gap(3);
    }
  }
}
