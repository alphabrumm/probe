// Probe – Respizienz: Die Lehrkraft reicht eine korrigierte Prüfung mit Klarnamen bei der Fachleitung ein.
// Ablauf: eingereicht → (gesehen) → Rückfrage an die Lehrkraft ⇄ erneut eingereicht → abgezeichnet.
// Das Paket (Prüfung mit Lösungen, Antworten, Bewertung) wird im Browser der Lehrkraft für jede Fachleitung einzeln verschlüsselt,
// ebenso jede Notiz für ihre Empfänger. Der Server sieht nur Klasse, Fach, Datum und Status.
// Archive: Die Fachleitung exportiert eingereichte Prüfungen als Datei – verschlüsselt für sich selbst, für die Admins und optional mit Passphrase.
import { protokollPdf } from './protokoll.js';
import { showPdf } from './pdf.js';

let X; // Hilfen aus probe.js: S, api, K, dialog, toast, withBusy, esc, fmtDate, fmtPts, main, view, pickFile
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const STAT = { eingereicht: ['In Respizienz · neu', 'warn'], gesehen: ['In Respizienz', 'warn'], rueckfrage: ['Rückfrage an Lehrkraft', 'bad'], abgezeichnet: ['✓ respiziert', 'good'] };
const STAT_LK = { eingereicht: ['In Respizienz', 'warn'], gesehen: ['In Respizienz', 'warn'], rueckfrage: ['Rückfrage der Fachleitung', 'bad'], abgezeichnet: ['✓ respiziert', 'good'] };
const chip = (s, T = STAT) => `<span class="chip ${T[s]?.[1] || ''}">${T[s]?.[0] || s}</span>`;
/** kleines Label für die Kacheln der Lehrkraft */
export const respChip = s => s ? chip(s, STAT_LK) : '';
const when = t => t ? new Date(t * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';
const KIND = { notiz: '', rueckfrage: '↩ Rückfrage', abgezeichnet: '✓ Abgezeichnet' };

/* ======================= Lehrkraft (in der Auswertung) ======================= */
export async function respState(e, H) {
  X = H;
  const r = await X.api('resp_targets', { id: e.id });
  if (r.last?.note_enc) { try { r.last.note = (await X.K.open(X.S.priv, r.last.note_enc)).t; } catch (er) { } } // ältere Fassung: eine Bemerkung
  r.notes = await openNotes(r.notes || []);
  return r;
}
async function openNotes(list) {
  const out = [];
  for (const n of list) { try { out.push({ ...n, t: (await X.K.open(X.S.priv, n.enc)).t }); } catch (er) { out.push({ ...n, t: '(nicht lesbar)' }); } }
  return out;
}
const noteHtml = (n, { del } = {}) => `<div class="cmt${n.kind === 'rueckfrage' ? ' new' : ''}"><b>${X.esc(n.author)}</b> · <span class="help">${when(n.created)}</span>${KIND[n.kind] ? ` <span class="chip ${n.kind === 'rueckfrage' ? 'bad' : 'good'}">${KIND[n.kind]}</span>` : ''}${n.for_teacher === false ? ' <span class="chip">intern</span>' : n.for_teacher && del !== undefined ? ' <span class="chip">für die Lehrkraft</span>' : ''}
  <p style="white-space:pre-wrap">${X.esc(n.t)}</p>${del && n.kind === 'notiz' ? `<button class="btn sm ghost" data-ndel="${n.id}">Löschen</button>` : ''}</div>`;

export function respHtml(R) {
  const { esc } = X;
  if (!R) return '';
  if (R.demo) return '<p class="help">Hier reichst du eine fertig korrigierte Prüfung mit einem Klick bei deiner Fachleitung ein. Im Demo-Modus ist das abgeschaltet – Demo-Prüfungen gehen nie an echte Fachleitungen.</p>';
  const who = R.to.map(u => esc(u.name || u.kuerzel)).join(', ');
  const L = R.last;
  const state = L ? `<p>${chip(L.status, STAT_LK)} Eingereicht am ${when(L.created)}${L.updated && L.updated !== L.created ? ` · zuletzt am ${when(L.updated)}` : ''}${L.seen ? ` · angesehen am ${when(L.seen)}` : ''}${L.signed ? ` · abgezeichnet von ${esc(L.signer)} am ${when(L.signed)}` : ''}</p>
    ${L.status === 'rueckfrage' ? '<p class="err" style="margin:6px 0">Die Fachleitung hat eine Rückfrage. Passe die Bewertung an (oder antworte ihr persönlich) und reiche die Prüfung danach erneut ein.</p>' : ''}
    ${L.status === 'abgezeichnet' ? '<p class="help">Änderst du danach noch etwas an der Bewertung, reiche die Prüfung bitte erneut ein – die Fachleitung zeichnet dann noch einmal ab.</p>' : ''}
    ${L.note ? `<div class="ans">💬 ${esc(L.note)}</div>` : ''}${R.notes.length ? `<div style="margin-top:8px"><b>Notizen der Fachleitung</b>${R.notes.map(n => noteHtml(n)).join('')}</div>` : ''}` : '';
  if (!R.fachschaft) return `<p class="help">Für dieses Fach ist keine Fachschaft eingetragen – deshalb kann die Prüfung nicht zur Respizienz gehen. Der Admin ordnet Fächer unter „Fachschaften“ zu.</p>${state}`;
  if (!R.to.length) return `<p class="help">Die Fachschaft ${esc(R.fachschaft.name)} hat noch keine Fachleitung mit eingerichtetem Konto – deshalb kann die Prüfung noch nicht zur Respizienz gehen. Der Admin vergibt die Rolle bei den Lehrkräften.</p>${state}`;
  return `${state}<div class="btns"><button class="btn${!L || L.status === 'rueckfrage' ? ' pri' : ''}" id="resp">📤 ${L ? 'Erneut einreichen' : 'Zur Respizienz einreichen'}</button></div>
    <p class="help">Geht an die Fachleitung ${esc(R.fachschaft.name)}: ${who}. Sie sieht die Prüfung mit Lösungen, alle Antworten, Punkte und Noten mit Namen. ${L ? 'Erneutes Einreichen ersetzt die bisherige Fassung; die Notizen bleiben.' : ''}</p>`;
}
/** Paket bauen und für jede Fachleitung verschlüsseln */
export async function respSubmit(S2, R) {
  const { e, key, g, people } = S2;
  if (!confirm(`Prüfung ${e.klasse} · ${e.fach} zur Respizienz an ${R.to.map(u => u.name || u.kuerzel).join(', ')} senden?\n\nDie Fachleitung sieht die Prüfung mit Lösungen, alle Antworten, Punkte und Noten mit den Namen der Schüler.`)) return false;
  const pkg = {
    v: 1, at: Date.now(),
    exam: { klasse: e.klasse, fach: e.fach, art: e.art, datum: e.datum, titel: e.titel, schuljahr: e.schuljahr, skala: e.skala, dauer: e.dauer, lehrkraft: X.S.user.name || X.S.user.kuerzel, kuerzel: X.S.user.kuerzel },
    doc: e.draft || null, key, g,
    people: people.map(p => ({ id: p.id, v: p.v, n: p.n, ans: p.ans, fokus: p.fokus, imported: p.imported })),
  };
  await X.withBusy('Wird für die Fachleitung verschlüsselt …', async () => {
    const items = [];
    for (const u of R.to) items.push({ user_id: u.id, data_enc: await X.K.seal(u.pub_key, pkg) });
    await X.api('resp_submit', { id: e.id, fachschaft_id: R.fachschaft.id, teilnehmer: people.length, items });
  });
  X.toast('✓ Zur Respizienz eingereicht'); return true;
}

/* ======================= Fachleitung: Übersicht ======================= */
let filter = 'offen', filterSj = '';
const FILTER = { offen: ['Offen', r => r.status === 'eingereicht' || r.status === 'gesehen'], rueckfrage: ['Rückfrage', r => r.status === 'rueckfrage'], abgezeichnet: ['Abgezeichnet', r => r.status === 'abgezeichnet'], alle: ['Alle', () => true] };
export async function viewRespList(H) {
  X = H; const { esc, main } = X;
  main.innerHTML = '<p class="help">lädt …</p>';
  let L; try { L = (await X.api('resp_list')).items; } catch (er) { main.innerHTML = `<p class="err">${esc(er.message)}</p>`; return; }
  X.S.respOpen = L.filter(r => r.status === 'eingereicht').length; X.drawWho?.();
  const fs = X.S.user.fachleitung.map(f => esc(f.name)).join(', ');
  const sjs = [...new Set(L.map(r => r.schuljahr))].sort().reverse();
  const inSj = L.filter(r => !filterSj || r.schuljahr === filterSj), shown = inSj.filter(FILTER[filter][1]);
  const n = k => inSj.filter(FILTER[k][1]).length;
  main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a><h1>Respizienz</h1><p class="sub">Fachleitung ${fs} · ${L.length ? `${L.length} eingereicht · ${n('offen')} offen · ${n('rueckfrage')} mit Rückfrage · ${n('abgezeichnet')} abgezeichnet` : 'noch nichts eingereicht'}</p>
    <div class="bar"><span class="tabs">${Object.entries(FILTER).map(([k, [t]]) => `<button class="btn sm${k === filter ? ' pri' : ''}" data-f="${k}">${t} (${n(k)})</button>`).join('')}</span>
      ${sjs.length > 1 ? `<select id="sj" style="width:auto"><option value="">alle Schuljahre</option>${sjs.map(s => `<option${s === filterSj ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}<span class="sp"></span>
      <button class="btn" id="exp"${L.length ? '' : ' disabled'}>📦 Archiv exportieren</button><button class="btn" id="imp">📂 Archiv öffnen</button></div>
    <section class="card">${shown.length ? `<div class="scroll-x"><table class="t"><tr><th>Datum</th><th>Klasse</th><th>Fach · Art</th><th>Lehrkraft</th><th>Teilnehmer</th><th>Eingereicht</th><th>Stand</th></tr>
      ${shown.map(r => `<tr data-r="${r.id}" style="cursor:pointer"><td>${esc(X.fmtDate(r.datum))}</td><td><b>${esc(r.klasse)}</b></td><td>${esc(r.fach)} · ${esc(r.art)}<div class="help">${esc(r.titel)}</div></td><td>${esc(r.lehrkraft)}</td><td>${r.teilnehmer}</td><td>${when(r.updated || r.created)}</td><td>${chip(r.status)}${+r.notes ? ` <span class="chip">💬 ${r.notes}</span>` : ''}</td></tr>`).join('')}</table></div>`
      : `<p class="help">${L.length ? 'In dieser Auswahl ist nichts.' : 'Sobald eine Lehrkraft eine korrigierte Prüfung zur Respizienz einreicht, erscheint sie hier.'}</p>`}</section>
    <p class="help">Ablauf: Prüfung öffnen → durchsehen, bei Bedarf Notizen ergänzen → <b>Abzeichnen</b> (bei der Lehrkraft erscheint „✓ respiziert“) oder <b>Rückfrage</b> an die Lehrkraft (sie passt an und reicht erneut ein). Am Schuljahresende: <b>Archiv exportieren</b> – bevor der Admin die Prüfungen löscht.</p>`;
  main.onclick = ev => {
    const f = ev.target.closest('[data-f]'); if (f) { filter = f.dataset.f; viewRespList(H); return; }
    const t = ev.target.closest('[data-r]'); if (t) location.hash = '#/resp/' + t.dataset.r;
  };
  $('#sj') && ($('#sj').onchange = ev => { filterSj = ev.target.value; viewRespList(H); });
  $('#exp').onclick = () => exportDialog(L, sjs);
  $('#imp').onclick = () => importArchive(H);
}

/* ======================= Detailansicht (live und aus dem Archiv) ======================= */
async function loadPfsplit() { return import('../vendor/pathfinder/core/pfsplit.js'); }
function evaluate(P, M) {
  const { exam: E, key } = P, pts = E.skala === 'punkte';
  const g = { drop: [], feedback: {}, manual: {}, override: {}, accept: {}, ...P.g };
  const gkey = g.gkey || (pts ? M.POINTS_KEY : M.GRADE_KEY); g.gkey = gkey;
  const RS = P.people.map(p => { const R = M.gradeExam(key, p.ans, { manual: g.manual?.[p.id], override: g.override?.[p.id], accept: g.accept, drop: g.drop }); return { p, R, note: pts ? M.pointsFor(R.pct, gkey) : M.gradeFor(R.pct, gkey) }; })
    .sort((a, b) => a.p.n.localeCompare(b.p.n, 'de') || a.p.v.localeCompare(b.p.v, 'de'));
  return { g, gkey, RS, pts };
}

export async function viewResp(id, H) {
  X = H; const { esc, main } = X;
  main.innerHTML = '<p class="help">Wird entschlüsselt …</p>';
  let r, P, M, notes, fl;
  try {
    const res = await X.api('resp_get', { rid: id }); r = res.item; fl = res.fl; X.S.respOpen = res.open; X.drawWho?.();
    P = await X.K.open(X.S.priv, r.data_enc); M = await loadPfsplit(); notes = await openNotes(res.notes);
  } catch (er) { main.innerHTML = `<a class="back" href="#/resp">‹ Respizienz</a><p class="err">${esc(er.message || 'Konnte nicht entschlüsselt werden.')}</p>`; return; }
  if (r.note_enc && !notes.length && r.signer) notes.unshift({ id: 0, author: r.signer, created: r.signed, kind: 'abgezeichnet', for_teacher: true, t: '(Bemerkung für die Lehrkraft – nur sie kann sie lesen)' });
  render({ P, M, meta: r, notes, live: { id, fl, owner_id: r.owner_id, owner_pub: r.owner_pub }, back: '#/resp', backLabel: 'Respizienz' });
}

function render(ctx) {
  const { esc, main, fmtPts } = X, { P, M, meta: r, notes, live } = ctx;
  const { exam: E, key } = P, { g, gkey, RS, pts } = evaluate(P, M);
  const max = RS[0]?.R.max ?? key.tasks.reduce((s, t) => s + t.pts, 0);
  const grades = pts ? Array.from({ length: 16 }, (_, i) => 15 - i) : [1, 2, 3, 4, 5, 6];
  const cnt = Object.fromEntries(grades.map(n => [n, RS.filter(x => x.note === n).length])), top = Math.max(1, ...Object.values(cnt));
  const avg = RS.length ? RS.reduce((s, x) => s + x.note, 0) / RS.length : 0, bad = pts ? RS.filter(x => x.note < 5).length : (cnt[5] || 0) + (cnt[6] || 0);
  const col = n => pts ? (n >= 10 ? '#2f8a5b' : n >= 5 ? '#e8961e' : '#c0392b') : ({ 1: '#2f8a5b', 2: '#5aa66f', 3: '#a3b83b', 4: '#e8b21e', 5: '#e57a2b', 6: '#c0392b' })[n];
  const keyRows = pts ? gkey.map((v, i) => [i + 1, v]).reverse() : gkey.map((v, i) => [5 - i, v]).reverse();
  const pending = RS.reduce((s, x) => s + x.R.pending, 0), signed = r.status === 'abgezeichnet';
  const head = signed ? `✓ Abgezeichnet von ${esc(r.signer)} am ${when(r.signed)}` : r.status === 'rueckfrage' ? `↩ Rückfrage an die Lehrkraft am ${when(r.rueck)}` : live ? 'Durchsicht' : 'Nicht abgezeichnet';
  main.innerHTML = `<div class="printme resp-view"><a class="back" href="${ctx.back}">‹ ${ctx.backLabel}</a>
    <h1>${esc(E.klasse)} · ${esc(E.fach)} · ${esc(E.art)}</h1><p class="sub">${esc(E.titel)} · ${esc(X.fmtDate(E.datum))} · Lehrkraft: ${esc(r.lehrkraft)} · eingereicht am ${when(r.created)}${r.updated && r.updated !== r.created ? ` · zuletzt am ${when(r.updated)}` : ''}${ctx.back === '#/archiv' ? ' · aus dem Archiv' : ''}</p>
    <section class="card"><div class="bar" style="margin:0"><h2 style="margin:0">${head}</h2><span class="sp"></span>${pending ? `<span class="chip warn">${pending} Freitext-Antworten ohne Bewertung</span>` : '<span class="chip good">vollständig bewertet</span>'}</div>
      <div class="btns noprint" style="margin-top:12px">${live ? `${signed ? '<button class="btn" id="reopen">Abzeichnung zurücknehmen</button>' : '<button class="btn pri" id="sign">✓ Abzeichnen</button>'}<button class="btn" id="rueck">↩ Rückfrage an Lehrkraft</button>` : ''}
        <button class="btn" id="prot">📄 Prüfungsprotokoll</button>${P.doc ? '<button class="btn" id="look">👁 Prüfung ansehen</button>' : ''}<button class="btn" id="print">🖨 Drucken</button></div>
      ${live ? '<p class="help noprint">Abzeichnen: Bei der Lehrkraft erscheint „✓ respiziert“. Rückfrage: Die Prüfung geht mit deiner Notiz zurück; die Lehrkraft passt an und reicht erneut ein.</p>' : ''}</section>
    <section class="card" style="margin-top:16px"><h2>Notizen der Fachleitung</h2>${notes.length ? notes.map(n => noteHtml(n, { del: live && n.author_id === X.S.user.id })).join('') : '<p class="help">Noch keine Notizen.</p>'}
      ${live ? `<div class="noprint" style="margin-top:10px"><textarea id="nt" rows="3" placeholder="Notiz zur Prüfung, z. B. Notenschlüssel passt, Aufgabe 3 großzügiger bewerten …"></textarea>
        <div class="btns" style="align-items:center"><label class="ck" style="margin:0"><input type="checkbox" id="nft">Die Lehrkraft sieht diese Notiz</label><span class="sp"></span><button class="btn" id="nadd">Notiz speichern</button></div>
        <p class="help">Notizen werden verschlüsselt: intern nur für die Fachleitung, sonst zusätzlich für die Lehrkraft.</p></div>` : ''}</section>
    <div class="grid2" style="margin-top:16px"><section class="card"><h2>Verteilung</h2><div class="dist${pts ? ' pts' : ''}">${grades.map(n => `<div class="db"><span class="dc">${cnt[n] || ''}</span><i style="height:${Math.round(100 * cnt[n] / top)}%;background:${col(n)}"></i><span class="dl">${n}</span></div>`).join('')}</div>
      <p><b>Durchschnitt: ${RS.length ? avg.toFixed(2).replace('.', ',') : '–'}</b>${pts ? ' Punkte' : ''} · ${RS.length} Teilnehmer · ${pts ? 'unter 5 Punkten' : 'Note 5 und 6'}: ${bad}</p></section>
      <section class="card"><h2>Notenschlüssel</h2><table class="t"><tr><th>${pts ? 'Punkte' : 'Note'}</th><th>ab</th><th></th></tr>${keyRows.map(([n, v]) => `<tr><td><b>${n}</b></td><td>${v} %</td><td class="help">ab ${fmtPts(Math.ceil(max * v / 100 * 2) / 2)} von ${fmtPts(max)} P.</td></tr>`).join('')}</table>
      ${JSON.stringify(gkey) !== JSON.stringify(pts ? M.POINTS_KEY : M.GRADE_KEY) ? '<p class="help">⚠ weicht vom Abiturschlüssel ab</p>' : '<p class="help">Abiturschlüssel</p>'}</section></div>
    <section class="card" style="margin-top:16px"><h2>Ergebnisse</h2><div class="scroll-x"><table class="t"><tr><th>Name</th><th>Punkte</th><th>%</th><th>${pts ? 'Punkte (0–15)' : 'Note'}</th></tr>
      ${RS.map(x => `<tr data-p="${x.p.id}" style="cursor:pointer"><td><b>${esc(x.p.n)}</b>, ${esc(x.p.v)}${x.p.imported ? ' <span class="chip">Datei</span>' : ''}${x.p.fokus ? ` <span class="chip warn">${x.p.fokus}× Fokus</span>` : ''}</td><td>${fmtPts(x.R.total)} / ${fmtPts(x.R.max)}</td><td>${Math.round(x.R.pct)}</td><td><b>${x.note}</b></td></tr>`).join('')}</table></div>
      <p class="help noprint">Zeile antippen: Antworten und Bewertung dieses Schülers.</p></section>
    <section class="card" style="margin-top:16px"><h2>Aufgaben</h2><div class="scroll-x"><table class="t"><tr><th>Aufgabe</th><th>Ø Punkte</th><th></th></tr>
      ${key.tasks.map((t, i) => { const its = RS.map(x => x.R.items[i]), dropped = g.drop.includes(t.id); const a = its.length ? its.reduce((s, x) => s + (x.pts || 0), 0) / its.length : 0;
        return `<tr><td><b>${i + 1}. ${esc(t.title)}</b> <span class="help">${esc({ quiz: 'Quiz', gap: 'Lückentext', match: 'Zuordnen', mark: 'Markieren', sort: 'Sortieren', order: t.words ? 'Satzpuzzle' : 'Reihenfolge', task: t.short ? 'kurze Antwort' : 'Freitext', essay: 'Freitext' }[t.type] || t.type)}</span></td><td>${dropped ? '–' : `${fmtPts(Math.round(a * 10) / 10)} / ${fmtPts(t.pts)}`}</td><td>${dropped ? '<span class="chip">gestrichen</span>' : ''}${Object.keys(g.accept?.[t.id] || {}).length ? ' <span class="chip">weitere Antworten akzeptiert</span>' : ''}</td></tr>`; }).join('')}</table></div></section></div>`;
  $('#print').onclick = () => print();
  $('#prot').onclick = () => { try { showPdf(protokollPdf({ e: { ...E, skala: E.skala }, key, g, lehrkraft: r.lehrkraft, respizienz: r.status === 'abgezeichnet' ? `abgezeichnet von ${r.signer} am ${when(r.signed)}` : '' }, RS, X), `Pruefungsprotokoll_${E.klasse}_${E.fach}_${E.datum}.pdf`.replace(/[^\wäöüÄÖÜß.-]+/g, '_')); } catch (er) { console.error(er); X.toast('⚠ ' + X.esc(er.message)); } };
  $('#look') && ($('#look').onclick = () => X.view({ id: 0, klasse: E.klasse, fach: E.fach, art: E.art, dauer: E.dauer, draft: P.doc }));
  if (live) wireLive(ctx);
  main.onclick = ev => {
    const nd = ev.target.closest('[data-ndel]');
    if (nd && live) { if (!confirm('Notiz löschen?')) return; X.api('resp_note_delete', { rid: live.id, nid: +nd.dataset.ndel }).then(() => viewResp(live.id, X)).catch(er => X.toast('⚠ ' + esc(er.message))); return; }
    const t = ev.target.closest('[data-p]'); if (!t) return;
    const x = RS.find(y => y.p.id === +t.dataset.p), fb = g.feedback?.[x.p.id] || {};
    X.dialog(`${esc(x.p.v)} ${esc(x.p.n)} · ${fmtPts(x.R.total)} / ${fmtPts(x.R.max)} P. · ${pts ? '' : 'Note '}${x.note}`, key.tasks.map((tk, i) => {
      const it = x.R.items[i];
      return `<div class="pt"><div class="bar" style="margin:0"><b>${i + 1}. ${esc(tk.title)}</b><span class="sp"></span>${it.dropped ? '<span class="chip">gestrichen</span>' : `${it.pts == null ? '?' : fmtPts(it.pts)} / ${fmtPts(tk.pts)} P.`}</div>
        ${it.answer ? `<div class="ans">Antwort: ${esc(it.answer)}</div>` : ''}${it.parts.map(p => `<div class="ex-part ${p.ok ? 'ok' : 'no'}">${p.ok ? '✓' : '✗'} ${esc(p.label)} → ${esc(p.given || '–')}${p.ok ? '' : ` <span class="help">richtig: ${esc(p.expected)}</span>`}</div>`).join('')}
        ${!it.auto || it.text != null ? `<div class="ans${it.type === 'app' ? ' code' : ''}">${esc(it.text || '– keine Antwort –')}</div>${tk.rubric?.length ? `<div class="help">Erwartung: ${tk.rubric.map(q => `${esc(q.t)} (${fmtPts(q.p)})`).join(' · ')}</div>` : ''}` : ''}
        ${it.overridden ? '<div class="help">Punkte von der Lehrkraft geändert.</div>' : ''}${fb[tk.id] ? `<div class="help">Rückmeldung: ${esc(fb[tk.id])}</div>` : ''}</div>`;
    }).join(''), { wide: true });
  };
}

/** Notiz verschlüsseln: für alle Fachleitungen dieser Prüfung, bei forTeacher zusätzlich für die Lehrkraft */
async function sealNote(live, t, forTeacher) {
  const enc = {};
  for (const u of live.fl) enc[u.id] = await X.K.seal(u.pub_key, { t, at: Date.now() });
  if (!enc[X.S.user.id]) enc[X.S.user.id] = await X.K.seal(X.S.keys.pub_key, { t, at: Date.now() });
  if (forTeacher && live.owner_id && live.owner_pub) enc[live.owner_id] = await X.K.seal(live.owner_pub, { t, at: Date.now() });
  return enc;
}
function wireLive(ctx) {
  const { esc } = X, { live, P } = ctx, E = P.exam, back = () => viewResp(live.id, X);
  const send = async (kind, t, forTeacher) => {
    await X.api('resp_note', { rid: live.id, kind, for_teacher: forTeacher ? 1 : 0, enc: t ? await sealNote(live, t, forTeacher) : null });
  };
  $('#nadd').onclick = async () => {
    const t = $('#nt').value.trim(); if (!t) { $('#nt').focus(); return; }
    try { await send('notiz', t, $('#nft').checked); X.toast('✓ Notiz gespeichert'); back(); } catch (er) { X.toast('⚠ ' + esc(er.message)); }
  };
  $('#sign') && ($('#sign').onclick = () => {
    const d = X.dialog('Abzeichnen', `<p>Prüfung ${esc(E.klasse)} · ${esc(E.fach)} von ${esc(ctx.meta.lehrkraft)} als respiziert abzeichnen. Bei der Lehrkraft erscheint dann „✓ respiziert“.</p>
      <label class="f">Bemerkung für die Lehrkraft (optional)<textarea id="t" rows="4" placeholder="z. B. Alles in Ordnung, danke!"></textarea><span class="h">Wird verschlüsselt – nur die Lehrkraft und die Fachleitung können sie lesen.</span></label><button class="btn pri" id="go">✓ Abzeichnen</button>`);
    $('#go', d.el).onclick = async () => { try { await send('abgezeichnet', $('#t', d.el).value.trim(), true); d.close(); X.toast('✓ Abgezeichnet'); back(); } catch (er) { X.toast('⚠ ' + esc(er.message)); } };
  });
  $('#reopen') && ($('#reopen').onclick = async () => { if (!confirm('Abzeichnung zurücknehmen? Bei der Lehrkraft steht dann wieder „In Respizienz“.')) return; await X.api('resp_reopen', { rid: live.id }); back(); });
  $('#rueck').onclick = () => {
    const d = X.dialog('Rückfrage an die Lehrkraft', `<p>Die Prüfung geht zurück an ${esc(ctx.meta.lehrkraft)}. Bei ihr erscheint „Rückfrage der Fachleitung“ mit deiner Notiz; sie passt die Bewertung an und reicht erneut ein.</p>
      <label class="f">Was soll geändert oder geklärt werden?<textarea id="t" rows="5" placeholder="z. B. Aufgabe 5: Teilpunkte für den Ansatz vergeben; Notenschlüssel bitte an den Abiturschlüssel anpassen."></textarea></label><div class="err" id="err"></div><button class="btn pri" id="go">↩ Rückfrage senden</button>`);
    $('#go', d.el).onclick = async () => { const t = $('#t', d.el).value.trim(); if (!t) { $('#err', d.el).textContent = 'Bitte schreib kurz, worum es geht.'; return; } try { await send('rueckfrage', t, true); d.close(); X.toast('↩ Rückfrage gesendet'); back(); } catch (er) { $('#err', d.el).textContent = er.message; } };
  };
}

/* ======================= Archiv: Export ======================= */
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function exportDialog(L, sjs) {
  const { esc } = X;
  let admins = []; try { admins = (await X.api('archive_recipients')).admins; } catch (er) { }
  const others = admins.filter(a => a.pub_key !== X.S.keys.pub_key);
  const d = X.dialog('Respizienz-Archiv exportieren', `<p>Das Archiv ist eine Datei mit allen ausgewählten Prüfungen – mit Lösungen, Antworten, Noten, Namen und Notizen. Es ist verschlüsselt und lässt sich in Probe wieder öffnen (📂 Archiv öffnen).</p>
    <div class="row">${sjs.length ? `<label class="f">Schuljahr<select id="asj"><option value="">alle</option>${sjs.map(s => `<option${s === sjs[0] ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
    <label class="f">Prüfungen<select id="aw"><option value="alle">alle eingereichten</option><option value="ab">nur abgezeichnete</option></select></label></div>
    <label class="f">Archiv-Passphrase (optional)<input type="password" id="ap" autocomplete="new-password" placeholder="mindestens 10 Zeichen"><span class="h">Damit kann auch eine spätere Fachleitung das Archiv öffnen. Gut aufbewahren – Probe speichert sie nicht.</span></label>
    <label class="f">Passphrase wiederholen<input type="password" id="ap2" autocomplete="new-password"></label>
    <p class="help">Öffnen können das Archiv: <b>du</b> (mit deinem Passwort bzw. Wiederherstellungscode)${others.length ? `, die <b>Admins</b> ${others.map(a => esc(a.name || a.kuerzel)).join(', ')} (Rückfallweg, falls du Passwort und Passphrase verlierst)` : admins.length ? ' – du bist selbst Admin' : ' – <b>kein Admin hat ein eingerichtetes Konto</b>, es gibt also keinen Rückfallweg über den Admin'}${''}, und jeder, der die Passphrase kennt.</p>
    <p class="help">Bewahre die Datei sicher auf (z. B. im Schulnetz oder im verschlüsselten Speicher der Schule) – auch verschlüsselt enthält sie personenbezogene Daten.</p>
    <div class="err" id="err"></div><button class="btn pri" id="go">📦 Archiv erstellen</button>`, { wide: true });
  $('#go', d.el).onclick = async () => {
    const pp = $('#ap', d.el).value, sj = $('#asj', d.el)?.value || '', only = $('#aw', d.el).value === 'ab';
    if (pp && pp.length < 10) { $('#err', d.el).textContent = 'Die Passphrase braucht mindestens 10 Zeichen.'; return; }
    if (pp !== $('#ap2', d.el).value) { $('#err', d.el).textContent = 'Die beiden Passphrasen sind verschieden.'; return; }
    const sel = L.filter(r => (!sj || r.schuljahr === sj) && (!only || r.status === 'abgezeichnet'));
    if (!sel.length) { $('#err', d.el).textContent = 'In dieser Auswahl ist keine Prüfung.'; return; }
    try {
      const file = await X.withBusy(`Archiv wird erstellt … 0 / ${sel.length}`, async () => {
        const items = [];
        for (const m of sel) {
          const res = await X.api('resp_get', { rid: m.id, peek: 1 });
          const pkg = await X.K.open(X.S.priv, res.item.data_enc), notes = await openNotes(res.notes);
          const r = res.item;
          items.push({ meta: { lehrkraft: r.lehrkraft, fachschaft: r.fachschaft, schuljahr: r.schuljahr, klasse: r.klasse, fach: r.fach, art: r.art, datum: r.datum, titel: r.titel, teilnehmer: r.teilnehmer, created: r.created, updated: r.updated, seen: r.seen, status: r.status, signed: r.signed, signer: r.signer, rueck: r.rueck },
            pkg, notes: notes.map(n => ({ author: n.author, created: n.created, kind: n.kind, for_teacher: n.for_teacher, t: n.t })) });
          const b = $('.busy span'); if (b) b.textContent = `Archiv wird erstellt … ${items.length} / ${sel.length}`;
        }
        const fsn = [...new Set(sel.map(r => r.fachschaft).filter(Boolean))];
        const data = { v: 1, created: Date.now(), by: X.S.user.name || X.S.user.kuerzel, fachschaften: fsn, schuljahr: sj || 'alle', items };
        const users = [{ role: 'fachleitung', kuerzel: X.S.user.kuerzel, name: X.S.user.name, pub_key: X.S.keys.pub_key }, ...others.map(a => ({ role: 'admin', kuerzel: a.kuerzel, name: a.name, pub_key: a.pub_key }))];
        const A = await X.K.archiveSeal(data, { users, passphrase: pp, info: { fachschaften: fsn, schuljahr: sj || 'alle', pruefungen: items.length, von: X.S.user.kuerzel } });
        return { A, fsn };
      });
      const name = `Respizienz-Archiv_${(file.fsn.join('-') || 'Fachschaft')}_${(sj || 'alle').replace('/', '-')}_${new Date().toISOString().slice(0, 10)}.probe-archiv.json`.replace(/[^\wäöüÄÖÜß.-]+/g, '_');
      download(name, JSON.stringify(file.A));
      d.close(); X.toast(`✓ Archiv mit ${sel.length} Prüfung${sel.length === 1 ? '' : 'en'} erstellt`, 4000);
    } catch (er) { $('#err', d.el).textContent = er.message; }
  };
}

/* ======================= Archiv: öffnen und ansehen (nur im Browser, nichts geht an den Server) ======================= */
export function importArchive(H) {
  X = H; const { esc } = X;
  X.pickFile('.json,application/json', async f => {
    let A; try { A = JSON.parse(await f.text()); } catch (er) { X.toast('⚠ Die Datei ist kein Probe-Archiv.'); return; }
    if (A?.probe !== 'archiv') { X.toast('⚠ Die Datei ist kein Probe-Archiv.'); return; }
    let data = null;
    try { data = await X.withBusy('Archiv wird geöffnet …', () => X.K.archiveOpen(A, { priv: X.S.priv, pub: X.S.keys.pub_key })); } catch (er) { X.toast('⚠ ' + esc(er.message)); return; }
    const keys = A.rec.filter(r => r.t === 'key').map(r => `${esc(r.name || r.kuerzel)} (${r.role === 'admin' ? 'Admin' : 'Fachleitung'})`).join(', ');
    const done = dt => { X.S.archiv = { A, data: dt, file: f.name }; location.hash = '#/archiv'; X.route?.(); };
    if (data) return done(data);
    const hasPass = A.rec.some(r => r.t === 'pass');
    if (!hasPass) { X.dialog('Archiv lässt sich nicht öffnen', `<p>Dieses Archiv ist nicht für deinen Schlüssel verschlüsselt und hat keine Passphrase.</p><p class="help">Öffnen können es: ${keys || '–'}.</p>`); return; }
    const d = X.dialog('Archiv-Passphrase', `<p>Dieses Archiv ist nicht für deinen Schlüssel verschlüsselt. Mit der Archiv-Passphrase lässt es sich öffnen.</p>
      <label class="f">Passphrase<input type="password" id="pp" autocomplete="off"></label><p class="help">Ohne Passphrase öffnen es: ${keys || '–'}.</p><div class="err" id="err"></div><button class="btn pri" id="go">Öffnen</button>`);
    $('#go', d.el).onclick = async () => {
      const dt = await X.withBusy('Archiv wird geöffnet …', () => X.K.archiveOpen(A, { passphrase: $('#pp', d.el).value })).catch(() => null);
      if (!dt) { $('#err', d.el).textContent = 'Die Passphrase passt nicht.'; return; }
      d.close(); done(dt);
    };
  });
}
export async function viewArchiv(i, H) {
  X = H; const { esc, main } = X, AR = X.S.archiv;
  if (!AR) { location.hash = X.S.user.fachleitung?.length ? '#/resp' : '#/'; return; }
  const D = AR.data;
  if (i != null) {
    const it = D.items[i]; if (!it) { location.hash = '#/archiv'; return; }
    const M = await loadPfsplit();
    return render({ P: it.pkg, M, meta: it.meta, notes: it.notes.map(n => ({ ...n, author_id: null })), live: null, back: '#/archiv', backLabel: 'Archiv' });
  }
  main.innerHTML = `<a class="back" href="${X.S.user.fachleitung?.length ? '#/resp' : '#/admin'}">‹ ${X.S.user.fachleitung?.length ? 'Respizienz' : 'Admin'}</a><h1>Respizienz-Archiv</h1>
    <p class="sub">${esc(D.fachschaften.join(', ') || 'Fachschaft')} · Schuljahr ${esc(D.schuljahr)} · ${D.items.length} Prüfung${D.items.length === 1 ? '' : 'en'} · erstellt am ${new Date(D.created).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} von ${esc(D.by)}</p>
    <div class="bar"><span class="help">Datei: ${esc(AR.file)} · nur hier im Browser geöffnet – nichts davon liegt auf dem Server.</span><span class="sp"></span><button class="btn" id="close">Archiv schließen</button></div>
    <section class="card"><div class="scroll-x"><table class="t"><tr><th>Datum</th><th>Klasse</th><th>Fach · Art</th><th>Lehrkraft</th><th>Teilnehmer</th><th>Stand</th></tr>
      ${D.items.map((x, k) => { const r = x.meta; return `<tr data-a="${k}" style="cursor:pointer"><td>${esc(X.fmtDate(r.datum))}</td><td><b>${esc(r.klasse)}</b></td><td>${esc(r.fach)} · ${esc(r.art)}<div class="help">${esc(r.titel)}</div></td><td>${esc(r.lehrkraft)}</td><td>${r.teilnehmer}</td><td>${chip(r.status)}${x.notes.length ? ` <span class="chip">💬 ${x.notes.length}</span>` : ''}</td></tr>`; }).join('')}</table></div></section>`;
  main.onclick = ev => { const t = ev.target.closest('[data-a]'); if (t) location.hash = '#/archiv/' + t.dataset.a; };
  $('#close').onclick = () => { X.S.archiv = null; location.hash = X.S.user.fachleitung?.length ? '#/resp' : '#/admin'; };
}
