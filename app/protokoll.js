// Probe – Prüfungsprotokoll als PDF: Übersicht (Notenschlüssel, Verteilung, Ergebnisse, Aufgaben) und je Prüfling eine Seite.
// Entsteht im Browser der Lehrkraft aus der entschlüsselten Auswertung.
import { Pdf, Flow, PAGE_H, PAGE_W, fit } from './pdf.js';

const TYP = { quiz: 'Quiz', gap: 'Lückentext', match: 'Zuordnen', essay: 'Freitext' };
const plain = h => String(h ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/<sup>(.*?)<\/sup>/gi, '^$1').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const INK = '#1F2340', GREY = '#6B7085', GOOD = '#2F8A5B', BAD = '#C0392B', ACC = '#3B4FC4';

/**
 * @param S2  Auswertungs-Zustand aus run.js ({ e, key, g, people, M })
 * @param RS  results(): [{ p, R, note }]
 * @param X   Hilfen (fmtPts, fmtDate, S)
 */
export function protokollPdf(S2, RS, X) {
  const { e, key, g } = S2, { fmtPts, fmtDate } = X, pts = e.skala === 'punkte';
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
      return { cells: [String(i + 1), plain(t.title), TYP[t.type] || (t.short ? 'kurze Antwort' : 'freie Antwort'), fmtPts(t.pts), drop ? 'gestrichen' : fmtPts(Math.round(a * 10) / 10)], col: drop ? GREY : undefined };
    }));

  // Unterschrift
  F.need(44); F.gap(30);
  pdf.line(F.M, F.y, F.M + 200, F.y, '#888888', 0.6); pdf.line(F.M + 260, F.y, F.M + F.W, F.y, '#888888', 0.6);
  pdf.text('Ort, Datum', F.M, F.y + 11, 8.5, { col: GREY }); pdf.text('Unterschrift Lehrkraft', F.M + 260, F.y + 11, 8.5, { col: GREY });

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
      for (const p of it.parts || []) {
        const line = `${p.label}: ${p.given || '–'}${p.ok ? '' : `   (richtig: ${p.expected})`}`;
        F.need(14); pdf.text(p.ok ? 'richtig' : 'falsch', F.M + 6, F.y + 11, 8.5, { bold: true, col: p.ok ? GOOD : BAD });
        F.para(line, { size: 9.5, x: 52, after: 0, col: INK });
      }
      if (!it.auto) {
        F.para(it.text ? it.text : '– keine Antwort –', { size: 10, x: 6, col: it.text ? INK : GREY, after: 2 });
        if (t.rubric?.length) F.para('Erwartung: ' + t.rubric.map(r => `${plain(r.t)} (${fmtPts(r.p)})`).join(' · '), { size: 8.5, x: 6, col: GREY, after: 0 });
      }
      if (it.overridden) F.para('Punkte von der Lehrkraft angepasst.', { size: 8.5, x: 6, col: GREY, after: 0 });
      if (fb[t.id]) F.para('Rückmeldung: ' + fb[t.id], { size: 9.5, x: 6, col: ACC, after: 0 });
      F.gap(4);
    });
  }

  // Fußzeile „Seite i von n“
  const N = pdf.pages.length;
  for (let i = 0; i < N; i++) { pdf.page(i); pdf.text(`Seite ${i + 1} von ${N}`, PAGE_W - F.M, PAGE_H - 30, 8.5, { col: GREY, align: 'right' }); pdf.text('Erstellt mit Probe – vertraulich, enthält Schülerdaten', F.M, PAGE_H - 30, 8.5, { col: GREY }); }
  return pdf.bytes();
}
