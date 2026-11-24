// Probe – Coaching: Vorlagen (Reflexionsbögen der Schüler, Gesprächsbögen der Lehrkraft) und alles, was sie darstellt:
// Formular zum Ausfüllen, Leseansicht, Druckfassung (A4, wie die Papiervorlagen), Klassenstatistik und anonymisierte Zahlen.
// Vorlagen nach den Arbeitsentwürfen „Lerncoaching“ des Gymnasiums Herrsching (2026/27).
//
// Fragetypen: scale (1–10), single (eine Auswahl), multi (mehrere), text (Freitext, rows), line (kurz), date, matrix (+3 … −3),
// consent (Weitergabe an die nächste Klassleitung: Ja/Nein), info (Hinweis). stat: geht in Klassen- und Schulberatungs-Statistik
// ein (nie Freitext). w: Feld darf mit Einwilligung an die nächste Klassleitung weitergegeben werden.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SCALE = (id, q, lo, hi, extra = {}) => ({ t: 'scale', id, q, min: 1, max: 10, lo, hi, stat: true, ...extra });
const FAEHIGKEITEN = ['Vor einer Gruppe laut und verständlich vorlesen', 'Mündlich klar ausdrücken, was ich sagen möchte', 'Arbeitsergebnisse vor anderen präsentieren',
  'Meine Fremdsprachen im Gespräch anwenden', 'Längere Sachtexte lesen und verstehen', 'Wichtige Informationen in einem Text finden', 'Texte weitgehend fehlerfrei schreiben',
  'Mir Vokabeln und Lerninhalte gut merken', 'Schaubilder, Diagramme und Statistiken verstehen', 'Mit Karten umgehen und Maßstäbe einschätzen',
  'Computer und Tablet sinnvoll zum Lernen nutzen', 'Gezielt Informationen im Internet finden', 'In Gruppen gut und respektvoll zusammenarbeiten',
  'Mich höflich verhalten und Regeln beachten', 'Ordentlich und gepflegt auftreten', 'Meine Aufgaben zuverlässig notieren und erledigen',
  'Auch bei schwierigen Aufgaben weiterarbeiten', 'Pünktlich sein'];
const CONSENT = { t: 'consent', id: 'weitergabe', q: 'Freiwillige Schweigepflichtentbindung / Einwilligung',
  text: 'Darf deine jetzige Klassenleitung deine Lernziele, vereinbarten Hilfen und Ergebnisse an deine nächste Klassenleitung an dieser Schule weitergeben? Persönliche Dinge aus dem Gespräch werden nicht weitergegeben. Du kannst deine Entscheidung ändern. Wenn du Nein ankreuzt, hat das keine Nachteile.',
  opts: ['Ja, das ist okay.', 'Nein, das möchte ich nicht.'], stat: true };

export const VORLAGEN = {
  /* ---------- Reflexionsbögen (Schüler, vor dem Gespräch) ---------- */
  rk: {
    id: 'rk', kind: 'reflexion', label: 'Selbstreflexion kompakt (1 Seite)', head: 'LERNCOACHING | SELBSTREFLEXION · KOMPAKT', sub: 'Kreuze an und notiere nur, was dir wichtig ist.',
    sections: [
      { title: 'Wie geht es mir gerade?', qs: [
        SCALE('wohl', 'Wohlbefinden in der Schule', 'gar nicht wohl', 'sehr wohl'),
        { t: 'single', id: 'klasse', q: 'Ich fühle mich in meiner Klasse:', opts: ['wohl / zugehörig', 'teils / teils', 'eher allein'], stat: true },
        { t: 'text', id: 'gut_belastet', q: 'Was tut mir gut? Was belastet mich?', hint: 'Du musst nichts aufschreiben, was du lieber erzählst.', rows: 3 }] },
      { title: 'Mein Lernen und meine Zuversicht', qs: [
        { t: 'single', id: 'zuversicht', q: 'Ich glaube, dass ich Lernprobleme mit Übung und Unterstützung lösen kann:', opts: ['meistens', 'manchmal', 'eher selten'], stat: true },
        { t: 'multi', id: 'schwer', q: 'Im Moment fällt mir schwer:', opts: ['Motivation / Anfangen', 'Konzentration', 'Lernplanung', 'Lernstoff verstehen', 'Üben / Behalten', 'Prüfungsdruck'], stat: true },
        { t: 'line', id: 'faecher', q: 'Problemfächer (falls vorhanden):' },
        { t: 'text', id: 'gut', q: 'Das klappt bei mir schon gut:', rows: 2 }] },
      { title: 'Das möchte ich im Gespräch ansprechen', qs: [
        { t: 'text', id: 'thema', q: 'Mein wichtigstes Thema oder ein Beispiel:', rows: 2 },
        { t: 'multi', id: 'wunsch', q: 'Was wünsche ich mir? (Du kannst mehrere Dinge ankreuzen.)', opts: ['Tipps zum Lernen', 'Hilfe in einem Fach', 'Einfach reden'], stat: true },
        { t: 'line', id: 'schritt', q: 'Ein kleiner Schritt, den ich mir zutraue:' }] }],
    foot: ['Du musst nicht alles beantworten. Persönliche Dinge kannst du im Gespräch erzählen.', 'Du entscheidest mit, welches Thema heute wichtig ist.'],
  },
  rf: {
    id: 'rf', kind: 'reflexion', label: 'Selbstreflexion mit Fähigkeiten (2 Seiten)', head: 'LERNCOACHING | SELBSTREFLEXION', sub: 'So bereite ich mich auf unser Gespräch vor.',
    sections: [
      { title: 'Wie geht es mir in der Schule?', qs: [
        SCALE('wohl', 'Wie wohl fühlst du dich momentan in der Schule?', 'überhaupt nicht wohl', 'sehr wohl'),
        { t: 'text', id: 'warum', q: 'Warum habe ich diese Zahl gewählt?', rows: 2 },
        { t: 'text', id: 'hilft', q: 'Was hilft mir, mich in der Schule wohlzufühlen?', rows: 2 }] },
      { title: 'Wie erlebe ich meine Klasse und mein Umfeld?', qs: [
        { t: 'single', id: 'klasse', q: 'Ich fühle mich in meiner Klasse meistens …', opts: ['zugehörig', 'manchmal außen vor', 'eher allein'], stat: true },
        { t: 'multi', id: 'reden', q: 'Mit wem kann ich reden, wenn ich Hilfe brauche?', opts: ['Mitschüler/in', 'Lehrkraft', 'zu Hause', 'andere / niemand'], stat: true },
        { t: 'text', id: 'belastet', q: 'Gibt es etwas in der Schule, das dich belastet oder beschäftigt?', hint: 'Du darfst es auch erst im Gespräch erzählen.', rows: 3 }] },
      { title: 'Mein Lernen: Stärken und Schwierigkeiten', qs: [
        { t: 'text', id: 'gut', q: 'Das klappt schon gut / Das macht mir Spaß:', rows: 2 },
        { t: 'text', id: 'schwer', q: 'Das fällt mir schwer (mit einem Beispiel):', rows: 2 },
        { t: 'text', id: 'ansprechen', q: 'Das möchte ich im Gespräch unbedingt ansprechen:', rows: 2 },
        { t: 'line', id: 'ziel', q: 'Ein Ziel oder ein Wunsch für die nächste Zeit:' }] },
      { title: 'Meine Fähigkeiten: Was kann ich schon? Wobei brauche ich Hilfe?', qs: [
        { t: 'matrix', id: 'faehig', q: 'Kreuze an, wie gut du diese Dinge schon kannst. +3 = sehr gut, −3 = fällt mir sehr schwer.', items: FAEHIGKEITEN, vals: [3, 2, 1, -1, -2, -3], stat: true }] },
      { title: 'Das nehme ich mit ins Gespräch', qs: [
        { t: 'text', id: 'kann', q: 'Das kann ich schon gut:', rows: 2 },
        { t: 'text', id: 'hilfe', q: 'Hier wünsche ich mir Hilfe:', rows: 2 }] }],
    foot: ['Du musst nicht alles aufschreiben. Du kannst auch im Gespräch davon erzählen.'],
  },
  /* ---------- Gesprächsbögen (Lehrkraft, während des Gesprächs) ---------- */
  gf: {
    id: 'gf', kind: 'gespraech', label: 'Gesprächsbogen Fokus Lerncoaching', head: 'LERNCOACHING | GESPRÄCHSBOGEN', sub: 'Wir schauen gemeinsam hin und finden einen machbaren nächsten Schritt.',
    sections: [
      { title: 'Wie geht es dir gerade?', qs: [
        SCALE('wohl', 'Wohlbefinden in der Schule', 'gar nicht wohl', 'sehr wohl'),
        { t: 'text', id: 'gut_belastet', q: 'Das tut mir gut / das belastet mich gerade:', rows: 2 },
        { t: 'text', id: 'klasse', q: 'So geht es mir in meiner Klasse / mit anderen:', rows: 2 }] },
      { title: 'Das läuft gut – das ist heute wichtig', qs: [
        { t: 'line', id: 'staerke', q: 'Eine Stärke:', w: true },
        { t: 'multi', id: 'thema', q: 'Mein wichtigstes Thema heute:', opts: ['Planen', 'Verstehen', 'Üben', 'Wohlbefinden / Miteinander'], stat: true },
        { t: 'text', id: 'schwierig', q: 'Was genau ist schwierig? (ein Beispiel)', rows: 2 }] },
      { title: 'Wir finden eine passende Unterstützung', qs: [
        { t: 'multi', id: 'hilfen', q: 'Unterstützung', opts: ['Lernplan / Lernslots', 'Fünf-Schritte-Lesemethode', 'Mindmap / Tabelle / Zeitstrahl', 'Wiederholen / Selbstabfrage', 'Diagramme auswerten', 'Fachlehrkraft / Lernpartner', 'Vertrauensperson / weitere Beratung'], stat: true, w: true },
        { t: 'line', id: 'andere', q: 'Andere Idee:', w: true }] },
      { title: 'Das vereinbaren wir konkret', qs: [
        { t: 'text', id: 'vereinbarung', q: 'Ich werde / Wir werden:', rows: 3, w: true },
        { t: 'line', id: 'wann', q: 'Wann? Wie oft? Woran merken wir es?', w: true },
        { t: 'date', id: 'wieder', q: 'Wir schauen wieder drauf am:' },
        { t: 'single', id: 'ergebnis', q: 'Rückblick', opts: ['geholfen', 'teilweise', 'noch nicht'], stat: true, w: true }] }],
    consent: CONSENT, foot: ['Nur diese Vereinbarungen weitergeben, keine persönlichen Gesprächsnotizen.'],
  },
  gx: {
    id: 'gx', kind: 'gespraech', label: 'Gesprächsbogen flexibel', head: 'LERNCOACHING | GESPRÄCHSBOGEN · FLEXIBEL', sub: 'Mehrere Themen aufnehmen · gemeinsam einen nächsten Schritt finden',
    sections: [
      { title: 'Ankommen und einordnen', qs: [
        SCALE('wohl', 'Wohlbefinden', 'gar nicht wohl', 'sehr wohl'),
        { t: 'text', id: 'miteinander', q: 'Miteinander / soziale Situation:', rows: 2 },
        { t: 'line', id: 'staerke', q: 'Das läuft gut / eine Stärke:', w: true }] },
      { title: 'Gesprächsanlässe sammeln', qs: [
        { t: 'multi', id: 'anlaesse', q: 'Was beschäftigt dich? (Mehrere Themen sind möglich.)', opts: ['Lernen / Fächer', 'Motivation / Organisation', 'Wohlbefinden / Miteinander', 'Sonstiges'], stat: true },
        { t: 'text', id: 'beschaeftigt', q: 'Notizen zu den Themen:', rows: 4 },
        { t: 'line', id: 'wichtig', q: 'Heute am wichtigsten:' }] },
      { title: 'Unterstützung und nächster Schritt', qs: [
        { t: 'multi', id: 'hilfen', q: 'Unterstützung', opts: ['Lernmethode / Lernplan', 'Fachlehrkraft / Lernpartner', 'Vertrauensperson / Beratung', 'andere Unterstützung'], stat: true, w: true },
        { t: 'text', id: 'vereinbarung', q: 'Unsere Vereinbarung:', rows: 3, w: true },
        { t: 'line', id: 'bis', q: 'Bis wann? Woran merken wir es?', w: true },
        { t: 'date', id: 'wieder', q: 'Wiedervorlage am:' }] }],
    consent: CONSENT,
  },
  go: {
    id: 'go', kind: 'gespraech', label: 'Gesprächsbogen offen (Oberstufe)', head: 'LERNCOACHING | GESPRÄCHSBOGEN · OFFEN', sub: 'Viel Raum für das Wesentliche · für die Oberstufe',
    sections: [
      { title: 'Anamnese / Situation', qs: [
        { t: 'text', id: 'situation', q: 'Wie geht es mir? Was beschäftigt mich? Was läuft gut? Wo wünsche ich Unterstützung?', rows: 8 },
        SCALE('wohl', 'Wohlbefinden', 'gar nicht wohl', 'sehr wohl'),
        { t: 'line', id: 'anliegen', q: 'Wichtigstes Anliegen:' }] },
      { title: 'Hilfestellung / Plan', qs: [
        { t: 'text', id: 'plan', q: 'Was könnte helfen? Welche Vereinbarung treffen wir? Wer unterstützt?', rows: 8, w: true },
        { t: 'date', id: 'wieder', q: 'Nächster Kontakt / Termin:' },
        { t: 'text', id: 'ergebnis_text', q: 'Ergebnis / Rückblick:', rows: 3, w: true }] }],
    consent: CONSENT,
  },
};
export const REFLEXION = Object.values(VORLAGEN).filter(v => v.kind === 'reflexion');
export const GESPRAECH = Object.values(VORLAGEN).filter(v => v.kind === 'gespraech');
export const questions = tpl => [...tpl.sections.flatMap(s => s.qs.filter(q => q.t !== 'info')), ...(tpl.consent ? [tpl.consent] : [])];
/** Vorlage eines Coachings: Vorlage der Schule (Kopie im Coaching, aus PathFinder) oder eingebaute Vorlage */
export const tplOf = (c, w) => (w === 'r' ? c.rspec : c.gspec) || VORLAGEN[w === 'r' ? c.vorlage : c.gbogen];

/* ---------- Vorlagen der Schule (in PathFinder gestaltet) ---------- */
/** aus surveySpec (PathFinder) eine Coaching-Vorlage machen; id = „x“ + Nummer der Schulvorlage */
export function tplFromSpec(spec, kind, id, label) {
  const T = (label || spec.title || 'Eigene Vorlage').trim();
  return { id, kind, label: T, own: true, head: 'LERNCOACHING | ' + T.toUpperCase(), sub: spec.sub || '',
    sections: spec.sections.map(s => ({ title: s.title || '', qs: s.qs })), ...(spec.consent ? { consent: { ...spec.consent, stat: true } } : {}) };
}
const sgn = x => x > 0 ? '+' + x : x < 0 ? '−' + -x : String(x);
/** eingebaute Vorlage als PathFinder-Dokument (Startpunkt für eigene Vorlagen der Schulberatung) */
export function vorlageDoc(tpl) {
  let k = 0; const uid = () => 'v' + (++k).toString(36) + Math.random().toString(36).slice(2, 6);
  const blk = q => {
    const base = { id: uid(), q: q.q || '', ...(q.hint ? { hint: q.hint } : {}), ...(q.w ? { share: true } : {}) };
    if (q.t === 'scale') return { ...base, type: 'scale', min: q.min, max: q.max, lo: q.lo || '', hi: q.hi || '' };
    if (q.t === 'single' || q.t === 'multi' || q.t === 'consent') return { ...base, type: 'choice', opts: [...q.opts], ...(q.t === 'multi' ? { multi: true } : {}), ...(q.t === 'consent' ? { consent: true } : {}), ...(q.text ? { text: q.text } : {}) };
    if (q.t === 'matrix') return { ...base, type: 'matrix', items: [...q.items], cols: q.cols ? [...q.cols] : q.vals.map(sgn) };
    if (q.t === 'text' || q.t === 'line') return { ...base, type: 'open', rows: q.t === 'line' ? 1 : q.rows || 3 };
    if (q.t === 'date') return { ...base, type: 'datefield' };
    return null;
  };
  const stations = tpl.sections.map(s => ({ id: uid(), title: s.title, sub: '', blocks: s.qs.map(blk).filter(Boolean) }));
  if (tpl.consent) stations[stations.length - 1].blocks.push(blk(tpl.consent));
  return { id: uid(), form: 'befragung', title: tpl.label, subtitle: tpl.sub || '', kicker: 'Lerncoaching', pointsOn: false, cert: { on: false }, design: { theme: 'lumi', font: 'schlicht', shape: 'eckig' }, stations };
}
/** Hinweistexte aus PathFinder (Text, Infokasten, Bild, Tabelle) bereinigen: nur einfache Formatierung, Bilder nur als data: */
const OK_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'UL', 'OL', 'LI', 'SMALL', 'SUB', 'SUP', 'TABLE', 'TBODY', 'THEAD', 'TR', 'TD', 'TH', 'IMG', 'SPAN', 'DIV', 'H3', 'H4']);
export function safeHtml(html) {
  if (typeof DOMParser === 'undefined') return esc(String(html).replace(/<[^>]+>/g, ' '));
  const d = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'), root = d.body.firstChild;
  const walk = el => { for (const c of [...el.children]) {
    if (!OK_TAGS.has(c.tagName)) { c.replaceWith(...(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE'].includes(c.tagName) ? [] : [...c.childNodes])); continue; }
    for (const a of [...c.attributes]) if (!(c.tagName === 'IMG' && (a.name === 'alt' || (a.name === 'src' && /^data:image\/(png|gif|jpe?g|webp);/i.test(a.value))))) c.removeAttribute(a.name);
    if (c.tagName === 'IMG' && !c.getAttribute('src')) { c.remove(); continue; }
    walk(c);
  } };
  walk(root); walk(root); return root.innerHTML;
}
const mxLab = (q, x) => q.cols ? q.cols[q.vals.indexOf(x)] ?? sgn(x) : sgn(x);

/* ---------- Formular (Ausfüllen) ---------- */
const nm = (p, id) => `${p}${id}`;
function qHtml(q, v, p) {
  if (q.t === 'info') return `<div class="cq cq-info">${safeHtml(q.html || '')}</div>`;
  const name = nm(p, q.id), hint = q.hint ? `<span class="cq-hint">${esc(q.hint)}</span>` : '';
  const head = `<div class="cq-q">${esc(q.q)}${q.w ? ' <span class="cq-w" title="darf mit Einwilligung an die nächste Klassleitung">↪ Weitergabe</span>' : ''}</div>${hint}`;
  if (q.t === 'scale') return `<div class="cq" data-q="${q.id}">${head}<div class="cq-scale" role="radiogroup">${Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i).map(n => `<label class="sc"><input type="radio" name="${name}" value="${n}"${+v === n ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div><div class="cq-ends"><span>${q.min} = ${esc(q.lo)}</span><span>${q.max} = ${esc(q.hi)}</span></div></div>`;
  if (q.t === 'single' || q.t === 'consent') return `<div class="cq" data-q="${q.id}">${head}${q.text ? `<p class="cq-text">${esc(q.text)}</p>` : ''}<div class="cq-opts">${q.opts.map(o => `<label class="op"><input type="radio" name="${name}" value="${esc(o)}"${v === o ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></div>`;
  if (q.t === 'multi') { const a = Array.isArray(v) ? v : []; return `<div class="cq" data-q="${q.id}">${head}<div class="cq-opts">${q.opts.map(o => `<label class="op"><input type="checkbox" name="${name}" value="${esc(o)}"${a.includes(o) ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></div>`; }
  if (q.t === 'text') return `<div class="cq" data-q="${q.id}">${head}<textarea name="${name}" rows="${q.rows || 3}">${esc(v || '')}</textarea></div>`;
  if (q.t === 'line') return `<div class="cq" data-q="${q.id}">${head}<input type="text" name="${name}" value="${esc(v || '')}"></div>`;
  if (q.t === 'date') return `<div class="cq" data-q="${q.id}">${head}<input type="date" name="${name}" value="${esc(v || '')}" style="max-width:220px"></div>`;
  if (q.t === 'matrix') {
    const m = v && typeof v === 'object' ? v : {};
    const L = x => esc(mxLab(q, x)), wide = q.cols && q.cols.some(c => c.length > 3);
    return `<div class="cq" data-q="${q.id}">${head}<div class="cq-matrix${wide ? ' mx-wide' : ''}" style="--mxn:${q.vals.length}"><div class="mx-h"><span></span>${q.vals.map(x => `<b>${L(x)}</b>`).join('')}</div>${q.items.map((it, i) => `<div class="mx-r"><span class="mx-t">${i + 1}. ${esc(it)}</span>${q.vals.map(x => `<label class="mx-c" title="${L(x)}"><input type="radio" name="${name}_${i}" value="${x}"${+m[i] === x && m[i] !== undefined && m[i] !== '' ? ' checked' : ''}><span>${L(x)}</span></label>`).join('')}</div>`).join('')}</div></div>`;
  }
  return '';
}
/** Formular-HTML; p = Präfix für Feldnamen (mehrere Formulare auf einer Seite) */
export function formHtml(tpl, vals = {}, p = 'f_') {
  return tpl.sections.map((s, i) => `<section class="cs"><h3><span class="cs-n">${i + 1}</span>${esc(s.title)}</h3>${s.qs.map(q => qHtml(q, vals[q.id], p)).join('')}</section>`).join('')
    + (tpl.consent ? `<section class="cs cs-consent"><h3>✍︎ ${esc(tpl.consent.q)}</h3>${qHtml({ ...tpl.consent, q: '' }, vals.weitergabe, p).replace('<div class="cq-q"></div>', '')}<p class="cq-hint">Unterschrift von Schüler:in (ggf. Eltern) auf dem Ausdruck.</p></section>` : '')
    + (tpl.foot ? `<div class="cs-foot">${tpl.foot.map(f => `<p>ℹ︎ ${esc(f)}</p>`).join('')}</div>` : '');
}
/** Werte aus dem Formular lesen */
export function readForm(root, tpl, p = 'f_') {
  const o = {};
  for (const q of questions(tpl)) {
    const name = nm(p, q.id), sel = s => root.querySelector(s);
    if (q.t === 'scale') { const x = sel(`input[name="${name}"]:checked`); if (x) o[q.id] = +x.value; }
    else if (q.t === 'single' || q.t === 'consent') { const x = sel(`input[name="${name}"]:checked`); if (x) o[q.id] = x.value; }
    else if (q.t === 'multi') { const a = [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value); if (a.length) o[q.id] = a; }
    else if (q.t === 'matrix') { const m = {}; q.items.forEach((_, i) => { const x = sel(`input[name="${name}_${i}"]:checked`); if (x) m[i] = +x.value; }); if (Object.keys(m).length) o[q.id] = m; }
    else { const x = sel(`[name="${name}"]`); const t = x?.value.trim(); if (t) o[q.id] = t.slice(0, 5000); }
  }
  return o;
}
/** Anzahl beantworteter Fragen */
export const answered = (tpl, v) => questions(tpl).filter(q => v?.[q.id] !== undefined && v[q.id] !== '' && !(Array.isArray(v[q.id]) && !v[q.id].length)).length;

/* ---------- Leseansicht (z. B. rechts im Coachinggespräch) ---------- */
const sg = x => x > 0 ? '+' + x : x < 0 ? '−' + -x : String(x);
function valHtml(q, v) {
  const none = '<span class="cv-none">–</span>';
  if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return none;
  if (q.t === 'scale') return `<span class="cv-scale">${Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i).map(n => `<i class="${n === +v ? 'on' : ''}">${n}</i>`).join('')}</span>`;
  if (q.t === 'single' || q.t === 'consent') return `<b>${esc(v)}</b>`;
  if (q.t === 'multi') return v.map(x => `<span class="cv-chip">${esc(x)}</span>`).join(' ');
  if (q.t === 'date') return esc(new Date(v + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }));
  if (q.t === 'matrix') return `<div class="cv-mx">${q.items.map((it, i) => v[i] === undefined ? '' : `<div><span class="cv-mxv ${q.cols ? (q.vals.indexOf(v[i]) < q.vals.length / 2 ? 'pos' : 'neg') : v[i] > 0 ? 'pos' : 'neg'}">${esc(mxLab(q, v[i]))}</span>${esc(it)}</div>`).join('') || none}</div>`;
  return `<div class="cv-text">${esc(v).replace(/\n/g, '<br>')}</div>`;
}
export function viewHtml(tpl, v = {}) {
  return tpl.sections.map((s, i) => `<section class="cv-s"><h4><span class="cs-n">${i + 1}</span>${esc(s.title)}</h4>${s.qs.filter(q => q.t !== 'info').map(q => `<div class="cv-q"><div class="cv-l">${esc(q.q)}</div>${valHtml(q, v[q.id])}</div>`).join('')}</section>`).join('')
    + (tpl.consent ? `<section class="cv-s"><h4>✍︎ Weitergabe an die nächste Klassleitung</h4>${valHtml(tpl.consent, v.weitergabe)}</section>` : '');
}

/* ---------- Druckfassung (A4, wie die Papiervorlage) ---------- */
const box = on => `<span class="pb${on ? ' on' : ''}">${on ? '✕' : ''}</span>`;
function printQ(q, v) {
  if (q.t === 'info') return `<div class="pq pq-info">${safeHtml(q.html || '')}</div>`;
  const lab = q.q ? `<div class="pq-l">${esc(q.q)}</div>` : '';
  if (q.t === 'scale') return `<div class="pq">${lab}<div class="pq-scale">${Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i).map(n => `<span class="${n === +v ? 'on' : ''}">${n}</span>`).join('')}</div><div class="pq-ends">${q.min} = ${esc(q.lo)} · ${q.max} = ${esc(q.hi)}</div></div>`;
  if (q.t === 'single' || q.t === 'multi' || q.t === 'consent') { const a = Array.isArray(v) ? v : [v]; return `<div class="pq">${lab}${q.text ? `<p class="pq-t">${esc(q.text)}</p>` : ''}<div class="pq-opts">${q.opts.map(o => `<span>${box(a.includes(o))} ${esc(o)}</span>`).join('')}</div></div>`; }
  if (q.t === 'date') return `<div class="pq pq-inline">${lab}<span class="pq-line">${v ? esc(new Date(v + 'T12:00').toLocaleDateString('de-DE')) : ''}</span></div>`;
  if (q.t === 'matrix') { const m = v || {}; return `<div class="pq">${lab}<table class="pq-mx"><tr><th></th>${q.vals.map(x => `<th>${esc(mxLab(q, x))}</th>`).join('')}</tr>${q.items.map((it, i) => `<tr><td>${i + 1}. ${esc(it)}</td>${q.vals.map(x => `<td>${box(m[i] === x)}</td>`).join('')}</tr>`).join('')}</table></div>`; }
  return `<div class="pq">${lab}<div class="pq-box" style="min-height:${(q.t === "line" ? 1 : Math.min(q.rows || 3, 4)) * 1.2}em">${esc(v || '').replace(/\n/g, '<br>')}</div></div>`;
}
/** Eine A4-Seite (oder mehr) für den Ausdruck; meta: { name, klasse, datum, coach } */
export function printHtml(tpl, v = {}, meta = {}) {
  const coach = tpl.kind === 'gespraech';
  return `<div class="pp">
    <div class="pp-head"><b>${esc(tpl.head)}</b><span>${esc(tpl.sub || '')}</span></div>
    <div class="pp-meta"><span>Name: <u>${esc(meta.name || '')}</u></span><span>Klasse: <u>${esc(meta.klasse || '')}</u></span><span>Datum: <u>${esc(meta.datum || '')}</u></span>${coach ? `<span>Coach: <u>${esc(meta.coach || '')}</u></span>` : ''}</div>
    ${tpl.sections.map((s, i) => `<div class="pp-s"><h3><span class="cs-n">${i + 1}</span>${esc(s.title)}</h3>${s.qs.map(q => printQ(q, v[q.id])).join('')}</div>`).join('')}
    ${tpl.consent ? `<div class="pp-s pp-consent"><h3>${esc(tpl.consent.q)}</h3>${printQ({ ...tpl.consent, q: '' }, v.weitergabe)}<div class="pp-sign"><span>Unterschrift Schüler/in</span><span>ggf. Eltern</span></div></div>` : ''}
    ${tpl.foot ? `<div class="pp-foot">${tpl.foot.map(f => `<p>${esc(f)}</p>`).join('')}</div>` : ''}
    <div class="pp-conf">Vertraulich behandeln und nur für das Lerncoaching verwenden.</div>
  </div>`;
}

/* ---------- Statistik ---------- */
/** Zahlen für eine Klasse: je statistischer Frage Häufigkeiten, Mittelwerte (Skala, Raster). vals = Liste von Antwort-Objekten */
export function stats(tpl, vals) {
  const out = {};
  for (const q of questions(tpl).filter(q => q.stat)) {
    const vs = vals.map(v => v?.[q.id]).filter(x => x !== undefined && x !== '');
    if (q.t === 'scale') { const h = {}; for (let n = q.min; n <= q.max; n++) h[n] = 0; vs.forEach(x => { if (h[x] !== undefined) h[x]++; }); out[q.id] = { t: 'scale', n: vs.length, h, mean: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null }; }
    else if (q.t === 'single' || q.t === 'consent' || q.t === 'multi') { const c = Object.fromEntries(q.opts.map(o => [o, 0])); vs.forEach(x => (Array.isArray(x) ? x : [x]).forEach(o => { if (c[o] !== undefined) c[o]++; })); out[q.id] = { t: q.t, n: vs.length, c }; }
    else if (q.t === 'matrix') { const m = q.items.map((_, i) => { const a = vs.map(x => x[i]).filter(x => typeof x === 'number'); return { n: a.length, mean: a.length ? a.reduce((s, b) => s + b, 0) / a.length : null }; }); out[q.id] = { t: 'matrix', n: vs.length, m }; }
  }
  return out;
}
const fmt = x => x == null ? '–' : String(Math.round(x * 10) / 10).replace('.', ',');
const bar = (lab, c, n, extra = '') => `<div class="st-b"><span class="st-l">${esc(lab)}</span><span class="st-bar"><i style="width:${n ? Math.round(100 * Math.max(0, c) / n) : 0}%"></i></span><span class="st-c">${c < 0 ? '1–2' : c}${extra}</span></div>`;
/** Statistik als HTML (Klassen-Dashboard und Schulberatung); counts < 0 bedeuten „1–2“ (unterdrückt) */
export function statsHtml(tpl, st) {
  return questions(tpl).filter(q => q.stat && st[q.id]).map(q => {
    const s = st[q.id];
    if (s.t === 'scale') return `<div class="st"><div class="st-q">${esc(q.q)} <span class="st-n">Ø ${fmt(s.mean)} · n = ${s.n}</span></div><div class="st-hist">${Object.entries(s.h).map(([k, c]) => `<div title="${k}: ${c < 0 ? '1–2' : c}"><i style="height:${s.n ? Math.round(100 * Math.max(0, c) / Math.max(...Object.values(s.h).map(x => Math.max(0, x)), 1)) : 0}%"></i><span>${k}</span></div>`).join('')}</div></div>`;
    if (s.t === 'matrix') {
      const lo = Math.min(...q.vals), hi = Math.max(...q.vals), mid = lo < 0 && hi > 0 ? 0 : lo, pc = x => (x - lo) / (hi - lo || 1) * 100;
      const range = q.cols ? `Mittelwerte: ${esc(mxLab(q, hi))} = ${fmt(hi)} … ${esc(mxLab(q, lo))} = ${fmt(lo)}` : `Mittelwerte von ${sg(lo)} bis ${sg(hi)}`;
      return `<div class="st"><div class="st-q">${esc(q.q.split('.')[0])} <span class="st-n">${range} · n = ${s.n}</span></div>${q.items.map((it, i) => { const m = s.m[i]?.mean; return `<div class="st-b"><span class="st-l">${esc(it)}</span><span class="st-mx">${m == null ? '' : `<i class="${m >= mid && (mid !== lo || m >= (lo + hi) / 2) ? 'pos' : 'neg'}" style="left:${Math.min(pc(m), pc(mid))}%;width:${Math.abs(pc(m) - pc(mid))}%"></i>`}</span><span class="st-c">${fmt(m)}</span></div>`; }).join('')}</div>`;
    }
    return `<div class="st"><div class="st-q">${esc(q.q)} <span class="st-n">n = ${s.n}</span></div>${Object.entries(s.c).map(([o, c]) => bar(o, c, s.n)).join('')}</div>`;
  }).join('') || '<p class="help">Noch keine Antworten.</p>';
}
/** anonymisiert für die Schulberatung: Häufigkeiten 1–2 werden zu −1 („1–2“), Mittelwerte erst ab 3 Antworten */
export function anon(st) {
  const sup = c => c > 0 && c < 3 ? -1 : c, o = {};
  for (const [id, s] of Object.entries(st)) {
    if (s.t === 'scale') o[id] = { t: 'scale', n: s.n, h: Object.fromEntries(Object.entries(s.h).map(([k, c]) => [k, sup(c)])), mean: s.n >= 3 ? s.mean : null };
    else if (s.t === 'matrix') o[id] = { t: 'matrix', n: s.n, m: s.m.map(x => ({ n: x.n, mean: x.n >= 3 ? x.mean : null })) };
    else o[id] = { t: s.t, n: s.n, c: Object.fromEntries(Object.entries(s.c).map(([k, c]) => [k, sup(c)])) };
  }
  return o;
}
/** mehrere anonymisierte Statistiken addieren (Jahrgangsstufe); „1–2“ zählt für die Summe als 1,5, Mittelwerte gewichtet */
export function addStats(list) {
  const o = {};
  for (const st of list) for (const [id, s] of Object.entries(st)) {
    const t = o[id] = o[id] || (s.t === 'scale' ? { t: 'scale', n: 0, h: {}, sum: 0, wn: 0 } : s.t === 'matrix' ? { t: 'matrix', n: 0, m: s.m.map(() => ({ sum: 0, n: 0 })) } : { t: s.t, n: 0, c: {} });
    t.n += s.n;
    if (s.t === 'scale') { for (const [k, c] of Object.entries(s.h)) t.h[k] = (t.h[k] || 0) + (c < 0 ? 1.5 : c); if (s.mean != null) { t.sum += s.mean * s.n; t.wn += s.n; } }
    else if (s.t === 'matrix') s.m.forEach((x, i) => { if (x.mean != null && t.m[i]) { t.m[i].sum += x.mean * x.n; t.m[i].n += x.n; } });
    else for (const [k, c] of Object.entries(s.c)) t.c[k] = (t.c[k] || 0) + (c < 0 ? 1.5 : c);
  }
  for (const t of Object.values(o)) {
    if (t.t === 'scale') { t.mean = t.wn ? t.sum / t.wn : null; for (const k in t.h) t.h[k] = Math.round(t.h[k]); }
    else if (t.t === 'matrix') t.m = t.m.map(x => ({ n: x.n, mean: x.n ? x.sum / x.n : null }));
    else for (const k in t.c) t.c[k] = Math.round(t.c[k]);
  }
  return o;
}
