// Probe – KI-gestützte Korrektur mit einer externen KI.
// Export: Prüfung im PathFinder-Textformat (mit Lösungen und Erwartungshorizont) + Antworten aller Schüler, OHNE Namen.
//   Jeder Schüler bekommt eine Korrektur-Kennung (S-XXXXXX), aus dem Ergebniscode abgeleitet, aber nicht umkehrbar –
//   der Ergebniscode selbst öffnet die Ergebnisseite (mit Namen) und bleibt deshalb in Probe.
// Import: JSON der KI → Vorschläge in der (verschlüsselten) Bewertung: g.ki = { pid: { taskId: { pts, why, st } } }
//   st: 'neu' (offen) · 'ok' (übernommen) · 'nein' (abgelehnt)

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function kennung(e, p) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`probe-ki|${e.code || e.id}|${p.rc || 'p' + p.id}`)));
  let s = 'S-'; for (let i = 0; i < 6; i++) s += B32[h[i] % 32]; return s;
}
export async function kennungen(e, people) {
  const m = new Map(); for (const p of people) m.set(p.id, await kennung(e, p)); return m;
}

/** Namen der Schüler aus Antworten entfernen (falls jemand seinen Namen hineingeschrieben hat):
 *  Vor- und Nachname zusammen (alle Schüler) immer; der eigene Vorname allein großgeschrieben und nicht nach Artikel;
 *  der eigene Nachname allein nur als eigene Zeile („gez. Nagel“) – sonst träfe es Wörter wie „der Nagel“ oder „Lang“. */
const ART = 'der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|im|am|vom|zum|zur|beim|ins|kein|keine|keinen|mein|meine|dein|sein|seine|ihr|ihre|mit|ohne|für|durch|aus|von|zu|bei|nach|auf|an|in|über|unter|vor|Der|Die|Das|Den|Dem|Des|Ein|Eine|Im|Am';
function scrubber(people) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), parts = s => String(s || '').split(/[\s-]+/).filter(t => t.length >= 3);
  const full = [], own = new Map();
  for (const p of people) {
    const first = [...new Set([p.v, p.typed?.v].flatMap(parts))], last = [...new Set([p.n, p.typed?.n].flatMap(parts))];
    own.set(p.id, {
      first: first.length ? new RegExp(`(?<!\\b(?:${ART})\\s+)(?<![\\p{L}\\d_])(${first.map(esc).join('|')})(?![\\p{L}\\d_])`, 'gu') : null,
      last: last.length ? new RegExp(`^(\\s*(?:gez\\.?|Name:?|von)?\\s*)(${last.map(esc).join('|')})(\\s*[.,]?\\s*)$`, 'gmiu') : null,
    });
    for (const [v, n] of [[p.v, p.n], [p.typed?.v, p.typed?.n]]) if (v && n) full.push(`${v} ${n}`, `${n}, ${v}`, `${n} ${v}`);
  }
  const all = full.length ? new RegExp(`(${[...new Set(full)].sort((a, b) => b.length - a.length).map(esc).join('|')})`, 'giu') : null;
  return (pid, s) => {
    s = String(s ?? ''); if (all) s = s.replace(all, '[Name]');
    const o = own.get(pid); if (!o) return s;
    if (o.first) s = s.replace(o.first, '[Name]');
    if (o.last) s = s.replace(o.last, '$1[Name]$3');
    return s;
  };
}

const TYP = { quiz: 'Quiz (Multiple Choice)', gap: 'Lückentext', match: 'Zuordnen', essay: 'Freitext', mark: 'Markieren', sort: 'Sortieren', order: 'Reihenfolge', app: 'Programmieraufgabe' };
const typName = t => t.type === 'order' && t.words ? 'Satzpuzzle' : t.type === 'task' ? (t.short ? 'Aufgabe mit kurzer Antwort' : 'Freitext') : TYP[t.type] || t.type;
const fmt = n => String(Math.round(n * 2) / 2).replace('.', ',');
const block = s => { const t = String(s ?? '').replace(/\s+$/, ''); const f = t.includes('```') ? '~~~~' : '```'; return `${f}\n${t || '(leer)'}\n${f}`; };

/** Prüfungstext für die KI: PathFinder-Text ohne Anhang (Bilder) und ohne Gestaltungszeilen */
async function examText(doc) {
  if (!doc) return '';
  try {
    const T = await import('../vendor/pathfinder/core/pftext.js');
    const env = { palettes: [{ n: 'Pastell' }], figures: {}, plugins: [] };
    let t = T.docToText(doc, env, { refs: true });
    t = t.replace(/\n## Anhang[\s\S]*$/, '\n').split('\n').filter(l => !/^(Farbe|Schrift|Kopfbild|Kopfbild-Art|Titel-Animation|Untertitel-Animation|Animation):/.test(l)).join('\n');
    return t.trim();
  } catch (e) { console.warn(e); return ''; }
}

/**
 * Exporttext bauen.
 * S2: Auswertungs-Zustand (e, key, people, g, M), RS: results() aus run.js
 */
export async function buildExport(S2, RS) {
  const { e, key } = S2, ids = await kennungen(e, S2.people), scrub = scrubber(S2.people);
  const tasks = key.tasks.map((t, i) => ({ t, nr: i + 1 })).filter(x => !S2.g.drop.includes(x.t.id));
  const L = [];
  L.push(`# KI-Korrektur · ${e.fach} · ${e.klasse} · ${e.art}`, '',
    'Du hilfst einer Lehrkraft beim Korrigieren einer digitalen Prüfung (Plattform Probe). Unten stehen die Prüfung mit Musterlösungen und Erwartungshorizont und die Antworten aller Schüler. Die Schüler sind nur über eine Kennung (S-XXXXXX) angegeben.', '',
    '## Deine Aufgabe', '',
    '- Bewerte JEDE Aufgabe JEDES Schülers: Punkte von 0 bis zur Höchstpunktzahl der Aufgabe, in halben Punkten.',
    '- Maßstab sind Arbeitsauftrag, Musterlösung und Erwartungshorizont („Erwartung: … (Punkte)“). Bei mehreren Teilaspekten vergib die Punkte je erfülltem Aspekt.',
    '- Bewerte sinngemäß: Tipp- und Rechtschreibfehler, Groß-/Kleinschreibung, fehlende oder zusätzliche Leerzeichen und Satzzeichen kosten keine Punkte, wenn die Antwort inhaltlich stimmt. Beispiel: Erwartete Programmausgabe „Apollo hat 50 Liter Treibstoff.“, Ausgabe des Schülers „Apollo hat50 Liter Treibstoff“ → volle Punkte.',
    '- Programmieraufgaben (Java in JPad: println() ohne System.out, Wrapper-Typen wie Integer statt int sind richtig): Beurteile den Code und die Ausgabe des letzten Programmlaufs. Wurde das Programm nie ausgeführt oder danach noch geändert, beurteile den Code selbst und schreibe das in die Begründung. Werte Pflicht-Code („Muss:“) und erwartete Ausgabe („Ausgabe:“) sinngemäß, nicht zeichengenau.',
    '- „Probe: … P.“ ist die automatische Bewertung von Probe (zeichengenau bzw. nach festen Regeln), „bisher … P. (Lehrkraft)“ eine Bewertung der Lehrkraft. Übernimm sie, wenn sie stimmt; weiche ab, wenn sie dem Schüler nicht gerecht wird – in beide Richtungen. „noch nicht bewertet“: bewerte selbst.',
    '- Begründe jede Bewertung kurz und sachlich auf Deutsch (ein Satz; bei Abweichung von Probe: warum).',
    '- Schreibe die Kennungen genau ab. Stelle keine Vermutungen über die Identität der Schüler an.', '',
    '## Antwortformat', '',
    'Antworte NUR mit einem JSON-Codeblock in genau diesem Format (eine Zeile je Schüler und Aufgabe, alle Schüler, alle Aufgaben):', '',
    '```json',
    `{"probe":"ki-korrektur","pruefung":"${e.code || e.id}","bewertungen":[`,
    `  {"schueler":"S-ABCDEF","aufgabe":1,"punkte":2,"begruendung":"…"},`,
    `  {"schueler":"S-ABCDEF","aufgabe":2,"punkte":1.5,"begruendung":"…"}`,
    ']}', '```', '',
    'Wird die Antwort zu lang, teile sie auf mehrere solche JSON-Blöcke auf (jeder vollständig, mit Kopf "probe" und "pruefung") – die Lehrkraft kann alle nacheinander einlesen.', '');
  const text = await examText(e.draft);
  L.push('## Die Prüfung (mit Lösungen und Erwartungshorizont)', '',
    'Format: PathFinder-Text. „### …“ beginnt eine Aufgabe; die Aufgaben sind unten in derselben Reihenfolge nummeriert. „Lösung“, „Erwartung“, „Antwort“, ```java lösung``` und [x] beim Quiz sehen nur Lehrkraft und KI.', '');
  if (text) L.push(block(text), '');
  L.push('## Aufgabenübersicht', '');
  for (const { t, nr } of tasks) {
    L.push(`- Aufgabe ${nr}: „${t.title}“ – ${typName(t)}, höchstens ${fmt(t.pts)} P.`);
    if (t.rubric?.length) L.push(`  Erwartungshorizont: ${t.rubric.map(r => `${r.t} (${fmt(r.p)} P.)`).join('; ')}`);
    if (t.type === 'app') {
      if (t.expect) L.push(`  Erwartete Ausgabe (${t.compare === 'gleich' ? 'genau' : 'enthält'}): ${JSON.stringify(t.expect)}`);
      if ((t.needs || []).filter(Boolean).length) L.push(`  Pflicht-Code: ${t.needs.filter(Boolean).map(n => JSON.stringify(n)).join(', ')}`);
      if (t.solution) L.push('  Musterlösung:', block(t.solution).replace(/^/gm, '  '));
    } else if (t.solution) L.push(`  Musterlösung: ${String(t.solution).replace(/<[^>]*>/g, '').trim()}`);
    if (t.type === 'task' && t.short && t.answer != null) L.push(`  Richtige Antwort(en): ${String(t.answer).split('|').join(' oder ')}`);
  }
  L.push('', '## Antworten der Schüler', '');
  for (const x of RS.slice().sort((a, b) => ids.get(a.p.id).localeCompare(ids.get(b.p.id)))) {
    L.push(`### ${ids.get(x.p.id)}`, '');
    for (const { t, nr } of tasks) {
      const it = x.R.items[nr - 1];
      const pr = it.pts == null ? 'noch nicht bewertet' : !it.auto ? `bisher ${fmt(it.pts)} P. (Lehrkraft)` : `Probe: ${fmt(it.pts)} P.${it.overridden ? ' (von der Lehrkraft geändert)' : ''}`;
      L.push(`#### Aufgabe ${nr} · ${typName(t)} · höchstens ${fmt(t.pts)} P. · ${pr}`);
      if (t.type === 'app') {
        L.push(block(scrub(x.p.id, it.text || '(keine Abgabe)')));
        for (const p of it.parts) L.push(`- Probe-Prüfung „${p.label}“: ${p.ok ? 'erfüllt' : 'nicht erfüllt'}${p.ok ? '' : ` (erwartet: ${p.expected})`}`);
      } else if (it.text != null && !it.parts.length) L.push(block(scrub(x.p.id, it.text || '(keine Antwort)')));
      else {
        if (it.answer) L.push(`Antwort: ${scrub(x.p.id, it.answer)}`);
        for (const p of it.parts) L.push(`- ${p.label} → „${scrub(x.p.id, p.given || '')}“ (Probe: ${p.ok ? 'richtig' : `falsch, erwartet: ${p.expected}`})`);
        if (it.text) L.push(block(scrub(x.p.id, it.text)));
      }
      L.push('');
    }
  }
  return L.join('\n');
}

/** Antwort der KI lesen: alle JSON-Blöcke (```json … ```) oder ein reines JSON */
export function parseImport(text) {
  const s = String(text || '').trim(), objs = [];
  const tryParse = t => { try { const o = JSON.parse(t.replace(/^﻿/, '').replace(/,\s*([\]}])/g, '$1')); if (o && typeof o === 'object') objs.push(o); return true; } catch (e) { return false; } };
  const fences = [...s.matchAll(/(```|~~~)(?:json)?\s*\n([\s\S]*?)\n\s*\1/g)].map(m => m[2]);
  if (fences.length) fences.forEach(tryParse);
  else if (!tryParse(s)) { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) tryParse(s.slice(a, b + 1)); }
  const rows = [], codes = new Set();
  for (const o of objs) {
    if (o.pruefung != null) codes.add(String(o.pruefung));
    for (const r of Array.isArray(o.bewertungen) ? o.bewertungen : Array.isArray(o) ? o : []) rows.push(r);
  }
  return { rows, codes: [...codes], blocks: objs.length };
}

/**
 * Vorschläge übernehmen. Gibt eine Zusammenfassung zurück.
 * Bestehende Entscheidungen (übernommen/abgelehnt) bleiben, wenn die KI dieselben Punkte vorschlägt; neue Punkte → wieder offen.
 */
export async function applyImport(S2, parsed) {
  const { e, key, g } = S2, ids = await kennungen(e, S2.people), byKid = new Map([...ids].map(([pid, k]) => [k, pid]));
  const out = { ok: 0, unknown: new Set(), bad: 0, wrongExam: parsed.codes.some(c => c !== String(e.code || e.id)) };
  g.ki = g.ki || {};
  for (const r of parsed.rows) {
    const pid = byKid.get(String(r?.schueler || '').trim().toUpperCase());
    const nr = parseInt(r?.aufgabe, 10), t = key.tasks[nr - 1];
    if (pid == null) { if (r?.schueler) out.unknown.add(String(r.schueler)); continue; }
    if (!t || g.drop.includes(t.id)) { out.bad++; continue; }
    let pts = +String(r.punkte ?? '').replace(',', '.');
    if (!isFinite(pts)) { out.bad++; continue; }
    pts = Math.max(0, Math.min(t.pts, Math.round(pts * 2) / 2));
    const why = String(r.begruendung ?? r.grund ?? '').slice(0, 600);
    const m = g.ki[pid] = g.ki[pid] || {}, old = m[t.id];
    m[t.id] = { pts, why, st: old && old.pts === pts && old.st !== 'neu' ? old.st : 'neu', at: Date.now() };
    out.ok++;
  }
  return out;
}
