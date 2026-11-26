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

/**
 * Prüfungstext für die KI: PathFinder-Text ohne Anhang (Bilder) und ohne Gestaltungszeilen – nur die gewählten Aufgaben
 * (sel: Set der Aufgaben-IDs) und das Material, das in ihrer Station davor steht (Text, Tabellen, Code, Abbildungen).
 */
async function examText(doc, sel, taskIds) {
  if (!doc) return '';
  try {
    const T = await import('../vendor/pathfinder/core/pftext.js');
    const env = { palettes: [{ n: 'Pastell' }], figures: {}, plugins: [] };
    if (sel) {
      const stations = [];
      for (const st of doc.stations || []) {
        const bl = st.blocks || [], last = bl.map(b => sel.has(b.id)).lastIndexOf(true);
        if (last < 0) continue;
        stations.push({ ...st, blocks: bl.slice(0, last + 1).filter(b => sel.has(b.id) || !taskIds.has(b.id)) });
      }
      doc = { ...doc, stations };
    }
    let t = T.docToText(doc, env, { refs: true });
    t = t.replace(/\n## Anhang[\s\S]*$/, '\n').split('\n').filter(l => !/^(Farbe|Schrift|Kopfbild|Kopfbild-Art|Titel-Animation|Untertitel-Animation|Animation):/.test(l)).join('\n');
    return t.trim();
  } catch (e) { console.warn(e); return ''; }
}

/**
 * Exporttext bauen.
 * S2: Auswertungs-Zustand (e, key, people, g, M), RS: results() aus run.js
 */
export async function buildExport(S2, RS, selIds = null) {
  const { e, key } = S2, ids = await kennungen(e, S2.people), scrub = scrubber(S2.people);
  const sel = selIds ? new Set(selIds) : null;
  const tasks = key.tasks.map((t, i) => ({ t, nr: i + 1 })).filter(x => !S2.g.drop.includes(x.t.id) && !x.t.hand && (!sel || sel.has(x.t.id))); // Handschrift: nie an die KI
  const nrs = tasks.map(x => x.nr).join(', ');
  const L = [];
  L.push(`# KI-Korrektur · ${e.fach} · ${e.klasse} · ${e.art}`, '',
    'Du hilfst einer Lehrkraft beim Korrigieren einer digitalen Prüfung (Plattform Probe). Unten stehen die Prüfung mit Musterlösungen und Erwartungshorizont und die Antworten aller Schüler. Die Schüler sind nur über eine Kennung (S-XXXXXX) angegeben.', '',
    '## Deine Aufgabe', '',
    `- Bewerte bei JEDEM Schüler ${tasks.length === 1 ? `die Aufgabe ${nrs}` : `die Aufgaben ${nrs}`} (Nummern wie in der Prüfung; nur ${tasks.length === 1 ? 'diese Aufgabe ist' : 'diese Aufgaben sind'} hier enthalten): Punkte von 0 bis zur Höchstpunktzahl der Aufgabe, in halben Punkten.`,
    '- Maßstab sind Arbeitsauftrag, Musterlösung und Erwartungshorizont („Erwartung: … (Punkte)“). Bei mehreren Teilaspekten vergib die Punkte je erfülltem Aspekt.',
    '- Bewerte sinngemäß: Tipp- und Rechtschreibfehler, Groß-/Kleinschreibung, fehlende oder zusätzliche Leerzeichen und Satzzeichen kosten keine Punkte, wenn die Antwort inhaltlich stimmt. Beispiel: Erwartete Programmausgabe „Apollo hat 50 Liter Treibstoff.“, Ausgabe des Schülers „Apollo hat50 Liter Treibstoff“ → volle Punkte.',
    '- Programmieraufgaben (Java in JPad: println() ohne System.out, Wrapper-Typen wie Integer statt int sind richtig): Beurteile den Code und die Ausgabe des letzten Programmlaufs. Wurde das Programm nie ausgeführt oder danach noch geändert, beurteile den Code selbst und schreibe das in die Begründung. Werte Pflicht-Code („Muss:“) und erwartete Ausgabe („Ausgabe:“) sinngemäß, nicht zeichengenau.',
    '- „Probe: … P.“ ist die automatische Bewertung von Probe (zeichengenau bzw. nach festen Regeln), „bisher … P. (Lehrkraft)“ eine Bewertung der Lehrkraft. Übernimm sie, wenn sie stimmt; weiche ab, wenn sie dem Schüler nicht gerecht wird – in beide Richtungen. „noch nicht bewertet“: bewerte selbst.',
    '- Begründe jede Bewertung kurz und sachlich auf Deutsch (ein Satz; bei Abweichung von Probe: warum).',
    '- Schreibe die Kennungen genau ab. Stelle keine Vermutungen über die Identität der Schüler an.', '',
    '## Antwortformat', '',
    'Antworte mit GENAU EINEM einzigen JSON-Codeblock – kein Text davor oder danach, keine einzelnen Blöcke je Schüler oder je Aufgabe. Alle Bewertungen aller Schüler stehen zusammen in der Liste "bewertungen", eine Zeile je Schüler und Aufgabe:', '',
    '```json',
    `{"probe":"ki-korrektur","pruefung":"${e.code || e.id}","bewertungen":[`,
    `  {"schueler":"S-ABCDEF","aufgabe":${tasks[0]?.nr ?? 1},"punkte":2,"begruendung":"…"},`,
    `  {"schueler":"S-GHJKLM","aufgabe":${tasks[0]?.nr ?? 1},"punkte":1.5,"begruendung":"…"}`,
    ']}', '```', '',
    'Halte die Begründungen kurz (höchstens 15 Wörter), damit alles in die eine Antwort passt. Nur falls deine Antwort trotzdem abbrechen würde: höre nach einem vollständigen Schüler auf, schließe den Block korrekt ab und schreibe darunter „Fortsetzung folgt“ – die Lehrkraft fordert den Rest an und liest beide Teile nacheinander ein.', '');
  const text = await examText(e.draft, sel, new Set(key.tasks.map(t => t.id)));
  L.push(sel ? '## Die Aufgaben aus der Prüfung (mit Lösungen und Erwartungshorizont)' : '## Die Prüfung (mit Lösungen und Erwartungshorizont)', '',
    `Format: PathFinder-Text. „### …“ beginnt eine Aufgabe${sel ? '; davor steht das Material der Station, auf das sich die Aufgabe bezieht' : ''}. Die Nummern stehen in der Aufgabenübersicht unten. „Lösung“, „Erwartung“, „Antwort“, \`\`\`java lösung\`\`\` und [x] beim Quiz sehen nur Lehrkraft und KI.`, '');
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

/**
 * Antwort der KI lesen – möglichst nachsichtig, denn KIs halten sich nicht immer an das Format:
 * ein großer JSON-Block, viele einzelne Schnipsel (je Schüler oder je Bewertung), Listen, JSON-Zeilen,
 * mit oder ohne ```json-Rahmen und Text dazwischen. Gesammelt wird jedes Objekt mit Kennung, Aufgabe und Punkten.
 */
function jsonValues(text) {
  const out = [], s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]; if (c !== '{' && c !== '[') continue;
    let depth = 0, str = false, esc = false, j = i;
    for (; j < s.length; j++) {
      const d = s[j];
      if (str) { if (esc) esc = false; else if (d === '\\') esc = true; else if (d === '"') str = false; continue; }
      if (d === '"') str = true; else if (d === '{' || d === '[') depth++; else if (d === '}' || d === ']') { if (--depth === 0) break; }
    }
    if (depth !== 0) continue;
    const chunk = s.slice(i, j + 1);
    try { out.push(JSON.parse(chunk.replace(/,\s*([\]}])/g, '$1'))); i = j; } catch (e) { /* kein JSON ab hier – beim nächsten Zeichen weitersuchen */ }
  }
  return out;
}
const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null) return o[k]; return undefined; };
export function parseImport(text) {
  const rows = [], codes = new Set();
  const walk = (v, ctx) => {
    if (Array.isArray(v)) { v.forEach(x => walk(x, ctx)); return; }
    if (!v || typeof v !== 'object') return;
    const code = pick(v, 'pruefung', 'prüfung', 'exam'); if (code != null) codes.add(String(code));
    const sid = pick(v, 'schueler', 'schüler', 'kennung', 'student') ?? ctx.sid;
    const nr = pick(v, 'aufgabe', 'nr', 'task'), pts = pick(v, 'punkte', 'pts', 'points');
    if (sid != null && nr != null && pts != null && typeof pts !== 'object') rows.push({ schueler: sid, aufgabe: nr, punkte: pts, begruendung: pick(v, 'begruendung', 'begründung', 'grund', 'reason') ?? '' });
    for (const [k, x] of Object.entries(v)) if (x && typeof x === 'object') walk(x, { sid: /^S-[A-Z0-9]{6}$/i.test(k) ? k : sid });
  };
  for (const v of jsonValues(text)) walk(v, {});
  // doppelte Angaben (gleicher Schüler, gleiche Aufgabe): die letzte gilt
  const seen = new Map(); for (const r of rows) seen.set(String(r.schueler).trim().toUpperCase() + '|' + parseInt(r.aufgabe, 10), r);
  return { rows: [...seen.values()], codes: [...codes] };
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
    if (!t || g.drop.includes(t.id) || t.hand) { out.bad++; continue; } // Handschrift bewertet nie die KI
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
