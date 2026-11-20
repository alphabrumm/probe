// Probe – Durchführung (Live-Ansicht mit QR-Code) und Auswertung (Notenschlüssel, Korrektur, Veröffentlichen).
// Namen, Antworten, Lösungsschlüssel und Bewertung werden hier im Browser der Lehrkraft entschlüsselt.
import { qrSvg } from './qr.js';
import { respState, respHtml, respSubmit } from './resp.js';
import { protokollPdf } from './protokoll.js';
import { showPdf } from './pdf.js';
import { matchRoster } from './names.js';
import { buildExport, parseImport, applyImport } from './ki.js';

let X; // Hilfen aus probe.js: S, api, K, dialog, toast, withBusy, esc, fmtDate, fmtPts, field, main, pickFile, viewExam
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let liveTimer = null, clockTimer = null, liveRedraw = () => { };
export const stopLive = () => { clearInterval(liveTimer); clearInterval(clockTimer); liveTimer = clockTimer = null; };
addEventListener('hashchange', stopLive);

/* ---------- Namen abgleichen (Klassenliste ↔ Anmeldungen): app/names.js ---------- */
export { matchRoster };

/* ---------- Live ---------- */
export async function viewLive(e, helpers) {
  X = helpers; stopLive();
  const { esc, main } = X, ids = new Map();
  const link = new URL('s.html', location.href).href.replace(/[?#].*$/, '') + '?c=' + e.code;
  const decrypt = async p => { if (!ids.has(p.id)) { try { ids.set(p.id, await X.K.open(X.S.priv, p.identity_enc)); } catch (er) { ids.set(p.id, { v: '?', n: '(unlesbar)' }); } } return { ...p, ...ids.get(p.id) }; };
  main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a>
    <h1>${esc(e.klasse)} · ${esc(e.fach)} · ${esc(e.art)}</h1><p class="sub">${esc(e.titel)} · ${esc(X.fmtDate(e.datum))} <button class="btn sm ghost" id="ansehen">👁 Prüfung ansehen</button></p>
    ${e.dauer ? `<section class="card zeit" id="zeit"><div class="zt"><span class="help">Restzeit für alle</span><div class="big" id="zLeft">–</div><span class="help" id="zEnd"></span></div>
      <div class="stack"><div class="btns"><span class="help">Verlängern für alle:</span>${[1, 2, 5, 10, 15].map(m => `<button class="btn sm" data-plus="${m}">+${m} min</button>`).join('')}<span id="zSum"></span></div>
      <label class="check"><input type="checkbox" id="zAuto"> Automatisch abgeben, wenn die Zeit abgelaufen ist</label><p class="help" id="zHint"></p></div></section>` : ''}
    <div class="grid2"><section class="card live-qr"><div class="qrbox">${qrSvg(link, { title: 'QR-Code zur Prüfung' })}</div>
      <div class="stack"><div><span class="help">Code</span><div class="big">${esc(e.code)}</div></div>${e.pin_on ? `<div><span class="help">PIN</span><div class="big pin">${esc(e.pin)}</div></div>` : ''}
      <div class="help link">${esc(link)}</div><button class="btn" id="beamer">⛶ Für den Beamer</button></div></section>
    <section class="card"><h2 id="state"></h2><div class="stat" id="stat"></div><div class="btns" id="acts"></div><p class="help" id="hint"></p></section></div>
    <section class="card" style="margin-top:16px"><div class="bar"><h2 style="margin:0">Teilnehmer</h2><span class="sp"></span><button class="btn sm" id="imp">⤒ Abgabe aus Datei</button></div><div class="scroll-x"><table class="t" id="tab"></table></div></section>`;
  $('#beamer').onclick = () => beamer(e, link);
  $('#imp').onclick = () => importFile(e);
  $('#ansehen').onclick = ev => { ev.stopPropagation(); X.view(e); };
  const draw = async () => {
    let r; try { r = await X.api('exam_live', { id: e.id }); } catch (er) { $('#hint').textContent = '⚠ ' + er.message; return; }
    e = { ...e, ...r.exam }; const now = r.now;
    if (!['offen', 'geschlossen'].includes(e.status)) { stopLive(); X.viewExam(e.id); return; }
    const P = await Promise.all(r.participants.map(decrypt));
    const M = e.roster?.length ? matchRoster(e.roster, P) : null;
    const abg = P.filter(p => p.status === 'abgegeben').length, soll = e.erwartet || e.roster?.length || 0;
    $('#state').innerHTML = e.status === 'offen' ? '🟢 Prüfung läuft' : '⏸ Geschlossen – keine Abgaben';
    skew = now - Date.now() / 1000; clock();
    $('#stat').innerHTML = `<div><b>${P.length}${soll ? ` / ${soll}` : ''}</b><span>angemeldet</span></div><div><b>${abg}</b><span>abgegeben</span></div>${M ? `<div><b>${M.missing.length}</b><span>fehlen</span></div>` : ''}`;
    $('#acts').innerHTML = (e.status === 'offen' ? `<button class="btn" data-st="geschlossen">⏸ Schließen</button>` : `<button class="btn pri" data-st="offen">▶ Wieder öffnen</button>`)
      + `<button class="btn" data-join>${e.join_open ? '🔒 Einlass sperren' : '🔓 Einlass öffnen'}</button><button class="btn danger" data-st="beendet">■ Beenden und auswerten</button>`;
    $('#hint').textContent = e.status === 'offen' ? (e.join_open ? 'Schüler scannen den QR-Code und melden sich mit Namen' + (e.pin_on ? ' und PIN' : '') + ' an.' : 'Einlass gesperrt: Neue Anmeldungen sind nicht möglich, angemeldete Schüler arbeiten weiter.')
      : 'Solange geschlossen ist, kann niemand speichern oder abgeben. Wieder öffnen setzt die Prüfung fort; Beenden ist endgültig.';
    const rows = P.map(p => ({ ...p, m: M?.byPerson.get(p.id) })).sort((a, b) => a.n.localeCompare(b.n, 'de') || a.v.localeCompare(b.v, 'de'));
    const ago = t => !t ? '–' : now - t < 60 ? 'gerade' : `vor ${Math.round((now - t) / 60)} min`;
    $('#tab').innerHTML = `<tr><th>Name</th><th>Status</th><th>gespeichert</th><th>Fokus verlassen</th><th>${e.dauer ? 'Zuschlag (nur für diesen Schüler)' : 'Zuschlag'}</th><th></th></tr>`
      + rows.map(p => `<tr><td><b>${esc(p.n)}</b>, ${esc(p.v)}${M ? (p.m ? (p.m.exact ? '' : ` <span class="chip warn" title="ähnlicher Name in der Klassenliste">≈ ${esc(e.roster[p.m.idx].v)} ${esc(e.roster[p.m.idx].n)}</span>`) : ' <span class="chip warn">nicht in Liste</span>') : ''}</td>
        <td>${p.status === 'abgegeben' ? `<span class="chip good">✓ abgegeben${+p.imported ? ' (Datei)' : ''}</span>` : now - p.last_seen > 75 ? `<span class="chip bad">offline ${ago(p.last_seen)}</span>` : '<span class="chip">arbeitet</span>'}</td>
        <td>${ago(p.saved)}</td><td>${+p.fokus ? `<span class="chip ${+p.fokus > 2 ? 'bad' : 'warn'}">${p.fokus}×</span>` : '–'}</td>
        <td><select data-zu="${p.id}" style="width:auto;min-height:36px">${[0, 5, 10, 15, 20, 30, 45].map(m => `<option value="${m}"${+p.zuschlag === m ? ' selected' : ''}>${m ? '+' + m + ' min' : '–'}</option>`).join('')}</select></td>
        <td class="act"><button class="btn sm ghost" data-del="${p.id}" title="Anmeldung entfernen (z. B. doppelt)">✕</button></td></tr>`).join('')
      + (M ? M.missing.map(r => `<tr style="opacity:.55"><td>${esc(r.n)}, ${esc(r.v)}</td><td><span class="chip">fehlt</span></td><td colspan="4"></td></tr>`).join('') : '')
      + (!rows.length && !M ? '<tr><td colspan="6" class="help">Noch niemand angemeldet.</td></tr>' : '');
    const bm = $('#bm'); if (bm) bm.querySelector('.cnt').textContent = `${P.length}${soll ? ' / ' + soll : ''} angemeldet · ${abg} abgegeben`;
  };
  /* Restzeit sekundengenau; Verlängerung für alle und automatische Abgabe */
  let skew = 0;
  const clock = () => {
    if (!e.dauer || !e.opened || !$('#zeit')) return;
    const end = e.opened + (e.dauer + (e.verlaengert || 0)) * 60, left = Math.round(end - (Date.now() / 1000 + skew));
    $('#zLeft').textContent = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '0:00';
    $('#zLeft').classList.toggle('warn', left <= 300);
    $('#zEnd').textContent = 'Ende ' + new Date(end * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    $('#zSum').innerHTML = e.verlaengert ? `<span class="chip warn">insgesamt +${e.verlaengert} min <button class="x" data-unplus title="Verlängerung zurücknehmen">✕</button></span>` : '';
    if (document.activeElement !== $('#zAuto')) $('#zAuto').checked = e.auto_abgabe !== false;
    $('#zHint').textContent = e.auto_abgabe === false
      ? (left > 0 ? 'Die Schüler sehen die Zeit ablaufen, arbeiten bei 0:00 aber weiter. Abgegeben wird, wenn du schließt bzw. beendest – oder wenn ein Schüler selbst abgibt.' : '⏰ Die Zeit ist abgelaufen. Die Schüler arbeiten weiter, bis du die Prüfung schließt oder beendest.')
      : 'Bei 0:00 wird automatisch abgegeben (einzelne Zuschläge unten zählen zusätzlich).';
  };
  const setExam = r => { if (r?.exam) { e = { ...e, ...r.exam }; clock(); } };
  clockTimer = setInterval(clock, 1000);
  main.onclick = async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.plus) { setExam(await X.api('exam_verlaengern', { id: e.id, delta: +t.dataset.plus })); X.toast(`⏱ +${t.dataset.plus} min für alle`); return; }
      if (t.dataset.unplus != null) { if (confirm(`Die Verlängerung um ${e.verlaengert} min für alle zurücknehmen?`)) setExam(await X.api('exam_verlaengern', { id: e.id, set: 0 })); return; }
      if (t.dataset.st) {
        const to = t.dataset.st;
        if (to === 'beendet' && !confirm('Prüfung endgültig beenden? Danach kann niemand mehr abgeben; offene Arbeiten zählen mit ihrem letzten gespeicherten Stand. Weiter geht es mit der Auswertung.')) return;
        await X.api('exam_state', { id: e.id, to }); if (to === 'beendet') { stopLive(); X.viewExam(e.id); return; }
      }
      if (t.dataset.join != null) await X.api('exam_join_open', { id: e.id, open: !e.join_open });
      if (t.dataset.del && confirm('Diese Anmeldung entfernen? Ihre Antworten gehen verloren.')) await X.api('exam_participant_delete', { id: e.id, pid: +t.dataset.del });
      draw();
    } catch (er) { X.toast('⚠ ' + esc(er.message)); }
  };
  main.onchange = async ev => {
    if (ev.target.id === 'zAuto') {
      const on = ev.target.checked;
      if (!on && !confirm('Automatische Abgabe ausschalten? Die Schüler sehen weiter die Zeit, arbeiten bei 0:00 aber weiter, bis du die Prüfung schließt oder beendest.')) { ev.target.checked = true; return; }
      try { setExam(await X.api('exam_auto', { id: e.id, on })); X.toast(on ? 'Automatische Abgabe ist an' : 'Automatische Abgabe ist aus'); } catch (er) { ev.target.checked = !on; X.toast('⚠ ' + esc(er.message)); }
      return;
    }
    const s = ev.target.closest('[data-zu]'); if (s) { await X.api('exam_zuschlag', { id: e.id, pid: +s.dataset.zu, minutes: +s.value }); X.toast('Zuschlag gespeichert'); } };
  liveRedraw = draw;
  await draw();
  liveTimer = setInterval(draw, 4000);
}
function beamer(e, link) {
  const d = document.createElement('div'); d.className = 'beamer'; d.id = 'bm';
  d.innerHTML = `<button class="btn" data-x>✕ Schließen</button><div class="bq">${qrSvg(link)}</div><div class="bi"><div class="help">Code</div><div class="big">${X.esc(e.code)}</div>${e.pin_on ? `<div class="help">PIN</div><div class="big pin">${X.esc(e.pin)}</div>` : ''}<div class="cnt"></div><div class="help">${X.esc(link)}</div></div>`;
  document.body.appendChild(d);
  d.onclick = ev => { if (ev.target.closest('[data-x]')) { d.remove(); document.exitFullscreen?.().catch(() => { }); } };
  d.requestFullscreen?.().catch(() => { });
}
function importFile(e) {
  X.pickFile('.json,application/json', async f => {
    try {
      const j = JSON.parse(await f.text());
      if (j.probe !== 'abgabe' || j.code !== e.code) throw new Error('Diese Datei gehört nicht zu dieser Prüfung.');
      const who = await X.K.open(X.S.priv, j.identity_enc);
      if (!confirm(`Abgabe von ${who.v} ${who.n} (gesichert ${new Date(j.at).toLocaleString('de-DE')}) übernehmen? Sie ersetzt den bisher gespeicherten Stand.`)) return;
      await X.api('exam_import', { id: e.id, pid: j.pid || 0, identity_enc: j.identity_enc, answers_enc: j.answers_enc });
      X.toast('✓ Abgabe übernommen'); liveRedraw();
    } catch (er) { X.toast('⚠ ' + X.esc(er.message), 5000); }
  });
}

/* ---------- Auswertung ---------- */
let S2 = null; // geladene Auswertung: { e, key, people, g, comments, M, saveT }
const G0 = skala => ({ v: 1, gkey: skala === 'punkte' ? null : null, manual: {}, override: {}, feedback: {}, accept: {}, drop: [], days: 14 });
export async function viewEval(e, helpers) {
  X = helpers; stopLive();
  const { esc, main, K, S } = X;
  main.innerHTML = '<p class="help">Auswertung wird entschlüsselt …</p>';
  const M = await import('../vendor/pathfinder/core/pfsplit.js');
  let r; try { r = await X.api('exam_results', { id: e.id }); } catch (er) { main.innerHTML = `<p class="err">${esc(er.message)}</p>`; return; }
  const key = await K.open(S.priv, r.key_enc);
  const g = r.grading_enc ? await K.open(S.priv, r.grading_enc) : G0(e.skala);
  g.gkey = g.gkey || (e.skala === 'punkte' ? M.POINTS_KEY.slice() : M.GRADE_KEY.slice());
  const people = [];
  for (const p of r.participants) {
    let who = { v: '?', n: '(unlesbar)', rc: '' }, ans = {};
    try { who = await K.open(S.priv, p.identity_enc); } catch (er) { }
    try { if (p.answers_enc) ans = (await K.open(S.priv, p.answers_enc)).answers || {}; } catch (er) { }
    people.push({ id: p.id, v: who.v, n: who.n, rc: who.rc, ans, status: p.status, imported: +p.imported, fokus: +p.fokus, saved: +p.saved || 0, rid: who.rc ? (await K.reportKeys(who.rc)).rid : '' });
  }
  const comments = [];
  for (const c of r.comments) { try { comments.push({ ...c, ...(await K.open(S.priv, c.comment_enc)) }); } catch (er) { } }
  S2 = { e: { ...e, ...r.exam }, key, raw: people, people: [], g, comments, M, resp: null };
  buildPeople();
  try { S2.resp = await respState(S2.e, X); } catch (er) { }
  drawEval();
}
/* ---------- Namen: Klassenliste zuordnen, doppelte Anmeldungen zusammenführen ----------
 * Alles steht in der (verschlüsselten) Bewertung g und lässt sich jederzeit ändern – an den Abgaben selbst ändert sich nichts.
 *   g.link  { pid: 'Nachname|Vorname' }  von der Lehrkraft festgelegter Eintrag der Klassenliste ('' = gehört zu niemandem der Liste)
 *   g.merge { pid: pidZiel }             diese Anmeldung gehört zu pidZiel; ihre Antworten füllen dort nur Aufgaben ohne Antwort
 */
const rkey = r => r.n + '|' + r.v;
const isEmptyAns = v => v == null || v === '' || (Array.isArray(v) ? v.every(isEmptyAns) : typeof v === 'object' && Object.keys(v).length === 0);
/** Antwort der gültigen Anmeldung, Fehlendes aus der anderen: bei Quiz, Lückentext, Zuordnen und Sortieren je Frage/Lücke/Paar/Begriff,
 *  sonst nur ganze Aufgaben (Markierungen, Reihenfolgen, Texte und Code aus zwei Anmeldungen nicht vermischen) */
const PER_PART = new Set(['quiz', 'gap', 'match', 'sort']);
function fillAns(type, a, b) {
  if (isEmptyAns(a)) return b;
  if (!PER_PART.has(type) || isEmptyAns(b) || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return a;
  const o = Array.isArray(a) ? a.slice() : { ...a };
  for (const k of Object.keys(b)) if (isEmptyAns(o[k])) o[k] = b[k];
  return o;
}
function mergeTarget(id) { const { raw, g } = S2, t = g.merge?.[id]; return t != null && t !== id && raw.some(p => p.id === t) && g.merge[t] == null ? t : null; }
function buildPeople() {
  const { raw, g, e } = S2; g.merge = g.merge || {}; g.link = g.link || {};
  const roster = e.roster || [], types = Object.fromEntries(S2.key.tasks.map(t => [t.id, t.type]));
  const people = raw.filter(p => mergeTarget(p.id) == null).map(p => {
    const parts = raw.filter(q => mergeTarget(q.id) === p.id), ans = { ...p.ans };
    for (const q of parts) for (const k of Object.keys(q.ans || {})) ans[k] = fillAns(types[k], ans[k], q.ans[k]);
    return { ...p, ans, typed: { v: p.v, n: p.n }, merged: parts, rids: [p.rid, ...parts.map(q => q.rid)].filter(Boolean),
      fokus: p.fokus + parts.reduce((s, q) => s + q.fokus, 0), imported: p.imported || parts.some(q => q.imported) ? 1 : 0, m: null };
  });
  S2.missing = [];
  if (roster.length) {
    const fixed = new Map();
    for (const p of people) if (Object.prototype.hasOwnProperty.call(g.link, p.id)) {
      const k = g.link[p.id], i = k ? roster.findIndex(r => rkey(r) === k) : -1;
      if (!k || i >= 0) fixed.set(p.id, i);
    }
    const R = matchRoster(roster, people.map(p => ({ id: p.id, v: p.typed.v, n: p.typed.n })), fixed);
    for (const p of people) {
      const m = R.byPerson.get(p.id);
      if (m) { const r = roster[m.idx]; p.v = r.v; p.n = r.n; p.m = m.manual ? 'manual' : m.exact ? 'exact' : 'approx'; }
      else p.m = fixed.get(p.id) === -1 ? 'outside' : 'none';
    }
    S2.missing = R.missing;
  }
  people.sort((a, b) => a.n.localeCompare(b.n, 'de') || a.v.localeCompare(b.v, 'de'));
  S2.people = people;
  for (const c of S2.comments) c.who = people.find(p => c.rid && p.rids.includes(c.rid));
}
const typedName = p => `${p.typed.v} ${p.typed.n}`.trim();
function nameChips(p) {
  const { esc } = X, t = esc(typedName(p));
  return ({ approx: ` <span class="chip warn" title="so eingegeben – automatisch der Klassenliste zugeordnet">≈ „${t}“</span>`, manual: p.typed.v !== p.v || p.typed.n !== p.n ? ` <span class="chip" title="von dir zugeordnet">↔ „${t}“</span>` : '',
    none: ' <span class="chip bad">nicht in der Klassenliste</span>', outside: ' <span class="chip">nicht in der Klassenliste</span>' }[p.m] || '')
    + (p.merged.length ? ` <span class="chip" title="${esc(p.merged.map(q => `${q.v} ${q.n}`).join(', '))}">＋${p.merged.length} Anmeldung${p.merged.length > 1 ? 'en' : ''}</span>` : '');
}
/** Namen-Bereich im Bewertungsdialog: Klassenliste zuordnen, mit anderer Anmeldung zusammenführen, wieder trennen */
function nameBox(p) {
  const { esc } = X, { e } = S2, roster = e.roster || [], taken = new Map(S2.people.filter(q => q.m && q.m !== 'none' && q.m !== 'outside').map(q => [rkey(q), q]));
  const linkSel = roster.length ? `<label class="help">Klassenliste <select data-link style="width:auto;min-height:36px">
      <option value="*"${!Object.prototype.hasOwnProperty.call(S2.g.link, p.id) ? ' selected' : ''}>automatisch${p.m === 'exact' || p.m === 'approx' ? ` (${esc(p.v)} ${esc(p.n)})` : ''}</option>
      ${roster.map(r => { const o = taken.get(rkey(r)); return `<option value="${esc(rkey(r))}"${S2.g.link[p.id] === rkey(r) ? ' selected' : ''}>${esc(r.n)}, ${esc(r.v)}${o && o.id !== p.id ? ` – jetzt bei „${esc(typedName(o))}“` : ''}</option>`; }).join('')}
      <option value=""${S2.g.link[p.id] === '' ? ' selected' : ''}>– gehört zu niemandem der Liste –</option></select></label>` : '';
  const others = S2.people.filter(q => q.id !== p.id);
  return `<div class="pt"><div class="help">Angemeldet als <b>${esc(typedName(p))}</b>${p.merged.map(q => ` · zusammengeführt mit <b>${esc(q.v)} ${esc(q.n)}</b> <button class="btn sm ghost" data-unmerge="${q.id}">trennen</button>`).join('')}</div>
    <div class="btns" style="margin:6px 0 0">${linkSel}${others.length ? `<label class="help">Doppelt angemeldet? <select data-mergesel style="width:auto;min-height:36px"><option value="">zusammenführen mit …</option>${others.map(q => `<option value="${q.id}">${esc(q.n)}, ${esc(q.v)}${q.typed.v !== q.v || q.typed.n !== q.n ? ` („${esc(typedName(q))}“)` : ''}</option>`).join('')}</select></label>` : ''}</div></div>`;
}
/** Namen-Aktionen im Dialog; true = erledigt (Dialog wird neu aufgebaut) */
function nameAction(ev, p, reopen) {
  const { g } = S2;
  const un = ev.target.closest?.('[data-unmerge]');
  if (un && ev.type === 'click') { delete g.merge[+un.dataset.unmerge]; saveGrading(); buildPeople(); drawEval(); reopen(); return true; }
  if (ev.type !== 'change') return false;
  if (ev.target.matches('[data-link]')) {
    const v = ev.target.value;
    if (v === '*') delete g.link[p.id];
    else { for (const k of Object.keys(g.link)) if (v && g.link[k] === v) delete g.link[k]; g.link[p.id] = v; }
    saveGrading(); buildPeople(); drawEval(); reopen(); return true;
  }
  if (ev.target.matches('[data-mergesel]') && ev.target.value) {
    const q = S2.people.find(x => x.id === +ev.target.value); if (!q) return true;
    if (!confirm(`„${typedName(q)}“ mit „${typedName(p)}“ zusammenführen?\n\nEs zählt die Anmeldung „${typedName(p)}“. Aufgaben, die dort keine Antwort haben, bekommen die Antwort aus „${typedName(q)}“. Du kannst das jederzeit wieder trennen.`)) { ev.target.value = ''; return true; }
    g.merge[q.id] = p.id; for (const x of q.merged) g.merge[x.id] = p.id;
    if (!Object.prototype.hasOwnProperty.call(g.link, p.id) && q.m === 'manual') g.link[p.id] = g.link[q.id];
    delete g.link[q.id];
    saveGrading(); buildPeople(); drawEval(); reopen(); return true;
  }
  return false;
}
/** fehlender Name der Klassenliste: eine Anmeldung auswählen, die zu ihm gehört */
function assignDialog(k) {
  const { esc } = X, r = (S2.e.roster || []).find(x => rkey(x) === k); if (!r) return;
  const list = S2.people.slice().sort((a, b) => (a.m === 'none' ? 0 : 1) - (b.m === 'none' ? 0 : 1));
  const d = X.dialog(`${esc(r.v)} ${esc(r.n)} zuordnen`, `<p class="help">Welche Anmeldung gehört zu <b>${esc(r.v)} ${esc(r.n)}</b>? Ist der Name bisher einem anderen Listeneintrag zugeordnet, wird er umgehängt.</p>
    ${list.map(p => `<button class="btn" style="display:flex;width:100%;margin:4px 0;text-align:left" data-pick="${p.id}"><span style="flex:1">„${esc(typedName(p))}“</span><span class="help">${p.m === 'none' ? 'nicht in der Liste' : p.m === 'outside' ? 'gehört zu niemandem der Liste' : `jetzt: ${esc(p.v)} ${esc(p.n)}`}</span></button>`).join('')}`);
  d.el.onclick = ev => {
    const b = ev.target.closest('[data-pick]'); if (!b) return;
    const { g } = S2; for (const x of Object.keys(g.link)) if (g.link[x] === k) delete g.link[x];
    g.link[+b.dataset.pick] = k; saveGrading(); buildPeople(); d.close(); drawEval();
  };
}
const gradeOf = (pct, g, skala, M) => skala === 'punkte' ? M.pointsFor(pct, g.gkey) : M.gradeFor(pct, g.gkey);
function results() {
  const { key, people, g, M, e } = S2;
  return people.map(p => {
    const R = M.gradeExam(key, p.ans, { manual: g.manual[p.id], override: g.override[p.id], accept: g.accept, drop: g.drop });
    return { p, R, note: gradeOf(R.pct, g, e.skala, M) };
  });
}
function saveGrading() {
  clearTimeout(S2.saveT);
  S2.saveT = setTimeout(async () => { try { await X.api('exam_grading', { id: S2.e.id, grading_enc: await X.K.seal(X.S.keys.pub_key, S2.g) }); } catch (er) { X.toast('⚠ Bewertung nicht gespeichert: ' + X.esc(er.message), 5000); } }, 600);
}
function drawEval() {
  const { esc, main, fmtPts } = X, { e, key, g, comments } = S2, RS = results(), pts = e.skala === 'punkte';
  const max = RS[0]?.R.max ?? key.tasks.reduce((s, t) => s + (g.drop.includes(t.id) ? 0 : t.pts), 0), pending = RS.reduce((s, x) => s + x.R.pending, 0);
  const unread = comments.filter(c => !+c.gelesen).length;
  const pub = e.status === 'veroeffentlicht';
  main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a>
    <h1>${esc(e.klasse)} · ${esc(e.fach)} · ${esc(e.art)}</h1><p class="sub">${esc(e.titel)} · ${esc(X.fmtDate(e.datum))} · ${RS.length} Teilnehmer · ${fmtPts(max)} Punkte</p>
    <section class="card"><div class="bar" style="margin:0"><h2 style="margin:0">${pub ? `✓ Veröffentlicht bis ${new Date(e.expires * 1000).toLocaleDateString('de-DE')}` : 'Auswertung'}</h2><span class="sp"></span>
      ${pending ? `<span class="chip warn">${pending} Freitext-Antwort${pending === 1 ? '' : 'en'} noch zu bewerten</span>` : '<span class="chip good">alles bewertet</span>'}
      ${unread ? `<span class="chip bad">💬 ${unread} neue Kommentare</span>` : ''}</div>
      <div class="btns" style="margin-top:12px"><button class="btn pri" id="pub">${pub ? '↻ Neu veröffentlichen' : '✓ Bewertung abschließen und veröffentlichen'}</button>${pub ? '<button class="btn" id="unpub">Veröffentlichung zurückziehen</button>' : ''}<button class="btn" id="prot">📄 Prüfungsprotokoll</button><button class="btn" id="csv">⇩ Notenliste (CSV)</button><button class="btn" id="ansehen">👁 Prüfung ansehen</button></div>
      <div class="btns ki-bar"><button class="btn ki" id="kiExp">${KI} KI-Korrektur: Export</button><button class="btn ki" id="kiImp">${KI} KI-Vorschläge einlesen</button>${kiSummary()}</div>
      <p class="help">${pub ? 'Änderungen an der Bewertung sehen die Schüler erst nach „Neu veröffentlichen“.' : 'Beim Veröffentlichen bekommt jeder Schüler eine eigene Ergebnisseite (mit seinem Ergebniscode), standardmäßig 14 Tage lang.'}</p></section>
    ${S2.resp ? `<section class="card" style="margin-top:16px"><h2>Respizienz</h2>${respHtml(S2.resp)}</section>` : ''}
    <div class="grid2" style="margin-top:16px"><section class="card"><h2>Notenschlüssel</h2><div id="key"></div></section><section class="card"><h2>Verteilung</h2><div id="dist"></div></section></div>
    <section class="card" style="margin-top:16px"><h2>Ergebnisse</h2><div class="scroll-x"><table class="t" id="res"></table></div><p class="help">Zeile antippen: Aufgaben einzeln ansehen, Punkte ändern, Rückmeldung schreiben – dort auch Namen der Klassenliste zuordnen oder doppelte Anmeldungen zusammenführen.</p><div id="miss"></div></section>
    <section class="card" style="margin-top:16px"><h2>Aufgaben</h2><div class="scroll-x"><table class="t" id="tasks"></table></div></section>
    ${comments.length ? `<section class="card" style="margin-top:16px"><h2>Kommentare der Schüler</h2>${comments.slice().reverse().map(c => `<div class="cmt${+c.gelesen ? '' : ' new'}"><b>${esc(c.who ? c.who.n + ', ' + c.who.v : c.name)}</b> · ${esc(c.title)} · <span class="help">${new Date(c.created * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span><p>${esc(c.text)}</p>${+c.gelesen ? '' : `<button class="btn sm" data-read="${c.id}">✓ gelesen</button>`} ${c.who ? `<button class="btn sm" data-person="${c.who.id}">Bewertung öffnen</button>` : ''}</div>`).join('')}</section>` : ''}`;
  drawKey(); drawTables();
  $('#pub').onclick = publish;
  $('#resp') && ($('#resp').onclick = async () => { try { if (await respSubmit(S2, S2.resp)) { S2.resp = await respState(S2.e, X); drawEval(); } } catch (er) { X.toast('⚠ ' + X.esc(er.message), 5000); } });
  $('#ansehen').onclick = () => X.view(e);
  $('#kiExp').onclick = kiExport; $('#kiImp').onclick = kiImport;
  $('#unpub') && ($('#unpub').onclick = async () => { if (!confirm('Ergebnisseiten der Schüler sofort sperren?')) return; await X.api('exam_state', { id: e.id, to: 'beendet' }); S2.e.status = 'beendet'; drawEval(); });
  $('#prot').onclick = () => { // Übersicht + je Prüfling eine Seite; entsteht hier im Browser
    try { showPdf(protokollPdf(S2, results(), X), `Pruefungsprotokoll_${e.klasse}_${e.fach}_${e.datum}.pdf`.replace(/[^\wäöüÄÖÜß.-]+/g, '_')); }
    catch (er) { console.error(er); X.toast('⚠ Protokoll konnte nicht erstellt werden: ' + X.esc(er.message), 5000); }
  };
  $('#csv').onclick = () => {
    const rows = [['Nachname', 'Vorname', 'Punkte', 'Max', 'Prozent', pts ? 'Notenpunkte' : 'Note'], ...results().map(x => [x.p.n, x.p.v, fmtPts(x.R.total), fmtPts(x.R.max), Math.round(x.R.pct), x.note])];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')], { type: 'text/csv' }));
    a.download = `Noten_${e.klasse}_${e.fach}_${e.datum}.csv`.replace(/[^\wäöüÄÖÜß.-]+/g, '_'); a.click();
  };
  main.onclick = async ev => {
    const t = ev.target.closest('[data-person],[data-task],[data-acc],[data-drop],[data-read],[data-assign]'); if (!t) return;
    if (t.dataset.assign != null) { assignDialog(t.dataset.assign); return; }
    if (t.dataset.person) personDialog(+t.dataset.person);
    if (t.dataset.task) essayDialog(t.dataset.task);
    if (t.dataset.acc) acceptDialog(t.dataset.acc);
    if (t.dataset.drop) { const id = t.dataset.drop, d = S2.g.drop; if (d.includes(id)) d.splice(d.indexOf(id), 1); else if (confirm('Diese Aufgabe für alle aus der Wertung nehmen?')) d.push(id); saveGrading(); drawEval(); }
    if (t.dataset.read) { await X.api('comment_read', { id: e.id, cid: +t.dataset.read }); const c = S2.comments.find(x => x.id === +t.dataset.read); if (c) c.gelesen = 1; drawEval(); }
  };
}
function drawKey() {
  const { esc, fmtPts } = X, { e, g, M } = S2, pts = e.skala === 'punkte', max = results()[0]?.R.max ?? 0;
  const labels = pts ? Array.from({ length: 15 }, (_, i) => `${i + 1} P.`) : ['Note 5', 'Note 4', 'Note 3', 'Note 2', 'Note 1'];
  const box = $('#key');
  box.innerHTML = `<div class="keys">${g.gkey.map((v, i) => `<label class="kr"><span>${labels[i]} ab</span><input type="range" min="0" max="100" step="1" value="${v}" data-k="${i}"><b data-kv="${i}">${v} %</b><span class="help" data-kp="${i}">ab ${fmtPts(Math.ceil(max * v / 100 * 2) / 2)} P.</span></label>`).join('')}</div>
    <div class="btns"><button class="btn sm" id="abi">Abiturschlüssel</button><span class="help">${pts ? 'Abitur-Tabelle: ab 20 % 1 Punkt … ab 95 % 15 Punkte.' : 'Standard: ab 20 % Note 5, ab 40 % Note 4, ab 55 % Note 3, ab 70 % Note 2, ab 85 % Note 1.'}</span></div>`;
  box.oninput = ev => {
    const i = ev.target.dataset.k; if (i == null) return;
    const k = g.gkey; k[+i] = +ev.target.value;
    for (let j = +i + 1; j < k.length; j++) if (k[j] < k[j - 1]) k[j] = k[j - 1]; // aufsteigend halten
    for (let j = +i - 1; j >= 0; j--) if (k[j] > k[j + 1]) k[j] = k[j + 1];
    k.forEach((v, j) => { $(`[data-k="${j}"]`, box).value = v; $(`[data-kv="${j}"]`, box).textContent = v + ' %'; $(`[data-kp="${j}"]`, box).textContent = `ab ${fmtPts(Math.ceil(max * v / 100 * 2) / 2)} P.`; });
    drawTables(); saveGrading();
  };
  $('#abi').onclick = () => { g.gkey = (pts ? M.POINTS_KEY : M.GRADE_KEY).slice(); drawKey(); drawTables(); saveGrading(); };
}
function drawTables() {
  const { esc, fmtPts } = X, { e, key, g } = S2, RS = results(), pts = e.skala === 'punkte';
  // Verteilung
  const grades = pts ? Array.from({ length: 16 }, (_, i) => 15 - i) : [1, 2, 3, 4, 5, 6];
  const cnt = Object.fromEntries(grades.map(n => [n, RS.filter(x => x.note === n).length])), top = Math.max(1, ...Object.values(cnt));
  const avg = RS.length ? RS.reduce((s, x) => s + x.note, 0) / RS.length : 0;
  const col = n => pts ? (n >= 10 ? '#2f8a5b' : n >= 5 ? '#e8961e' : '#c0392b') : ({ 1: '#2f8a5b', 2: '#5aa66f', 3: '#a3b83b', 4: '#e8b21e', 5: '#e57a2b', 6: '#c0392b' })[n];
  $('#dist').innerHTML = `<div class="dist${pts ? ' pts' : ''}">${grades.map(n => `<div class="db"><span class="dc">${cnt[n] || ''}</span><i style="height:${Math.round(100 * cnt[n] / top)}%;background:${col(n)}"></i><span class="dl">${n}</span></div>`).join('')}</div>
    <p><b>Durchschnitt: ${RS.length ? avg.toFixed(2).replace('.', ',') : '–'}</b>${pts ? ' Punkte' : ''} · ${RS.length} Teilnehmer${pts ? '' : ` · Note 5 und 6: ${(cnt[5] || 0) + (cnt[6] || 0)}`}</p>`;
  // Ergebnisse je Schüler
  const unread = new Set(S2.comments.filter(c => !+c.gelesen && c.who).map(c => c.who.id));
  $('#res').innerHTML = `<tr><th>Name</th><th>Punkte</th><th>%</th><th>${pts ? 'Punkte (0–15)' : 'Note'}</th><th></th></tr>` + RS.map(x => { const k = kiStats(x); return `<tr data-person="${x.p.id}" style="cursor:pointer"${k.diff ? ' class="ki-diff"' : ''}><td><b>${esc(x.p.n)}</b>, ${esc(x.p.v)}${nameChips(x.p)}${k.html}${x.p.imported ? ' <span class="chip">Datei</span>' : ''}${x.p.fokus ? ` <span class="chip warn" title="hat den Browser verlassen">${x.p.fokus}× Fokus</span>` : ''}</td>
    <td>${fmtPts(x.R.total)} / ${fmtPts(x.R.max)}</td><td>${Math.round(x.R.pct)}</td><td><b>${x.note}</b></td><td>${x.R.pending ? `<span class="chip warn">${x.R.pending} offen</span>` : ''}${unread.has(x.p.id) ? ' <span class="chip bad">💬</span>' : ''}</td></tr>`; }).join('');
  $('#miss').innerHTML = S2.missing?.length ? `<div class="pt"><b>Laut Klassenliste ohne Abgabe (${S2.missing.length}):</b> ${S2.missing.map(r => `<button class="btn sm ghost" data-assign="${esc(rkey(r))}" title="Anmeldung zuordnen">${esc(r.n)}, ${esc(r.v)} ↔</button>`).join(' ')}<div class="help">Hat sich jemand mit einem stark abweichenden Namen angemeldet, tippe seinen Namen an und wähle die Anmeldung.</div></div>` : '';
  // Aufgaben
  $('#tasks').innerHTML = `<tr><th>Aufgabe</th><th>Ø Punkte</th><th></th></tr>` + key.tasks.map((t, i) => {
    const its = RS.map(x => x.R.items[i]), drop = g.drop.includes(t.id), open = its.filter(x => x.open).length;
    const avg = its.length ? its.reduce((s, x) => s + (x.pts || 0), 0) / its.length : 0;
    const free = t.type === 'essay' || (t.type === 'task' && !t.short) || (t.type === 'app' && S2.M.appMode(t) !== 'auto'), acc = t.type === 'gap' || (t.type === 'task' && t.short);
    return `<tr${drop ? ' style="opacity:.5"' : ''}><td><b>${i + 1}. ${esc(t.title)}</b> <span class="help">${({ quiz: 'Quiz', gap: 'Lückentext', match: 'Zuordnen', mark: 'Markieren', sort: 'Sortieren', order: t.words ? 'Satzpuzzle' : 'Reihenfolge', essay: 'Freitext', app: S2.M.appName(t.app) + (S2.M.appMode(t) === 'auto' ? ' · automatisch' : ' · du bewertest') })[t.type] || (t.short ? 'kurze Antwort' : 'freie Antwort')}</span></td>
      <td>${drop ? 'gestrichen' : `${fmtPts(Math.round(avg * 10) / 10)} / ${fmtPts(t.pts)}`}${open ? ` <span class="chip warn">${open} offen</span>` : ''}</td>
      <td class="act">${free ? `<button class="btn sm${open ? ' pri' : ''}" data-task="${t.id}">Bewerten</button> ` : ''}${acc ? `<button class="btn sm" data-acc="${t.id}">Antworten</button> ` : ''}<button class="btn sm ghost" data-drop="${t.id}">${drop ? 'wieder werten' : 'streichen'}</button></td></tr>`;
  }).join('');
}
/** einen Schüler bewerten: alle Aufgaben, Punkte überschreiben, Rückmeldung */
function personDialog(pid) {
  const { esc, fmtPts } = X, { key, g } = S2, x = results().find(y => y.p.id === pid); if (!x) return;
  const fbk = g.feedback[pid] || {};
  const top = x.p.rc ? `<div class="help">Ergebniscode <b>${esc(x.p.rc)}</b>${S2.e.status === 'veroeffentlicht' ? ` · <a href="${esc(resultLink(x.p.rc))}" target="_blank" rel="noopener">Ergebnisseite ansehen (Vorschau)</a>` : ' · die Ergebnisseite gibt es nach dem Veröffentlichen'}</div>` : '';
  const d = X.dialog(`${esc(x.p.v)} ${esc(x.p.n)} · ${fmtPts(x.R.total)} / ${fmtPts(x.R.max)} P. · ${S2.e.skala === 'punkte' ? '' : 'Note '}${x.note}`, top + nameBox(x.p) + key.tasks.map((t, i) => {
    const it = x.R.items[i], free = !it.auto;
    return `<div class="pt"><div class="bar" style="margin:0"><b>${i + 1}. ${esc(t.title)}</b><span class="sp"></span>${it.dropped ? '<span class="chip">gestrichen</span>' : `<input type="number" min="0" max="${t.pts}" step="0.5" inputmode="decimal" data-pp="${t.id}" value="${it.pts ?? ''}" placeholder="?" style="width:5.5em"> / ${fmtPts(t.pts)} P.`}</div>
      ${it.answer ? `<div class="ans">Antwort: ${esc(it.answer)}</div>` : ''}${it.parts.map(p => `<div class="ex-part ${p.ok ? 'ok' : 'no'}">${p.ok ? '✓' : '✗'} ${esc(p.label)} → ${esc(p.given || '–')}${p.ok ? '' : ` <span class="help">richtig: ${esc(p.expected)}</span>`}</div>`).join('')}
      ${free || it.text != null ? `${ansHtml(it)}${t.rubric?.length ? `<div class="help">Erwartung: ${t.rubric.map(r => `${esc(r.t)} (${fmtPts(r.p)})`).join(' · ')}</div>` : ''}${t.solution ? solHtml(t) : ''}` : ''}${appBtn(t, it, pid)}
      ${it.overridden ? '<div class="help">Punkte von dir geändert (automatisch wären es anders).</div>' : ''}${kiBox(x.p, t, it)}
      <textarea data-fb="${t.id}" rows="2" placeholder="Rückmeldung zu dieser Aufgabe (sieht der Schüler)">${esc(fbk[t.id] || '')}</textarea></div>`;
  }).join('') + (kiStats(x).open > 1 ? `<div class="btns"><button class="btn ki" data-kiall="${pid}">${KI} Alle ${kiStats(x).open} offenen KI-Vorschläge übernehmen</button></div>` : '') + '<button class="btn pri" data-save>Speichern</button>', { wide: true });
  const reopen = () => { d.close(); personDialog(pid); };
  d.el.onchange = ev => { nameAction(ev, x.p, reopen); };
  d.el.onclick = ev => {
    if (appView(ev, x.p)) return;
    if (nameAction(ev, x.p, reopen)) return;
    if (kiAction(ev, reopen)) return;
    if (!ev.target.closest('[data-save]')) return;
    const man = g.manual[pid] = g.manual[pid] || {}, ov = g.override[pid] = g.override[pid] || {}, fb = g.feedback[pid] = {};
    for (const inp of $$('[data-pp]', d.el)) {
      const t = key.tasks.find(y => y.id === inp.dataset.pp), it = x.R.items[key.tasks.indexOf(t)], v = inp.value.trim();
      if (!it.auto) { if (v === '') delete man[t.id]; else man[t.id] = Math.min(t.pts, Math.max(0, +v.replace(',', '.'))); }
      else { const auto = S2.M.gradeExam(S2.key, x.p.ans, { accept: g.accept, drop: g.drop }).items[key.tasks.indexOf(t)].pts; if (v === '' || +v === auto) delete ov[t.id]; else ov[t.id] = Math.min(t.pts, Math.max(0, +v.replace(',', '.'))); }
    }
    for (const ta of $$('[data-fb]', d.el)) if (ta.value.trim()) fb[ta.dataset.fb] = ta.value.trim();
    saveGrading(); d.close(); drawEval();
  };
}
/* ---------- Programmier-Aufgaben (JPad …): Code ansehen, in der App öffnen und ausführen ---------- */
const ansHtml = it => `<div class="ans${it.type === 'app' ? ' code' : ''}">${X.esc(it.text || '– keine Antwort –')}</div>${it.suggest != null && it.pts == null ? `<div class="help">Vorschlag nach den automatischen Prüfungen: ${X.fmtPts(it.suggest)} P.</div>` : ''}`;
const solHtml = t => t.type === 'app' ? `<details class="help"><summary>Musterlösung</summary><div class="ans code">${X.esc(t.solution)}</div></details>` : `<div class="help">Musterlösung: ${X.esc(String(t.solution).replace(/<[^>]*>/g, ''))}</div>`;
const appBtn = (t, it, pid) => t.type === 'app' && it.files?.length ? `<div class="btns" style="margin:4px 0"><button class="btn sm" data-appview="${X.esc(t.id)}" data-pid="${pid}">▶ In ${X.esc(S2.M.appName(t.app))} öffnen und ausführen</button></div>` : '';
let APPM = null;
/** Klick auf „In JPad öffnen“: Stand des Schülers nur ansehen (Änderungen gehen nicht zurück) */
function appView(ev, p) {
  const b = ev.target.closest('[data-appview]'); if (!b) return false;
  const t = S2.key.tasks.find(x => x.id === b.dataset.appview), who = p || S2.people.find(x => x.id === +b.dataset.pid), a = who?.ans?.[t.id];
  (async () => {
    APPM = APPM || await import('../vendor/pathfinder/core/pfapp.js');
    let apps = {}; try { apps = (await X.api('cfg')).apps || {}; } catch (er) { }
    APPM.openApp({ app: t.app, url: apps[t.app], task: 'ansicht-' + t.id, title: `${t.title} · ${who.v} ${who.n}`, files: a?.files || [], readonly: true, closeLabel: 'Schließen' });
  })().catch(er => X.toast('⚠ ' + X.esc(er.message)));
  return true;
}
/** eine Freitext-Aufgabe für alle bewerten */
function essayDialog(tid) {
  const { esc, fmtPts } = X, { key, g } = S2, i = key.tasks.findIndex(t => t.id === tid), t = key.tasks[i], RS = results();
  const d = X.dialog(`${esc(t.title)} – für alle bewerten`, `${t.rubric?.length ? `<div class="help"><b>Erwartungshorizont:</b> ${t.rubric.map(r => `${esc(r.t)} (${fmtPts(r.p)} P.)`).join(' · ')}</div>` : ''}${t.solution ? solHtml(t) : ''}
    ${RS.map(x => { const it = x.R.items[i]; return `<div class="pt"><div class="bar" style="margin:0"><b>${esc(x.p.n)}, ${esc(x.p.v)}</b><span class="sp"></span><input type="number" min="0" max="${t.pts}" step="0.5" inputmode="decimal" data-ep="${x.p.id}" value="${it.pts ?? ''}" placeholder="?" style="width:5.5em"> / ${fmtPts(t.pts)} P.</div>${it.parts.map(p => `<div class="ex-part ${p.ok ? 'ok' : 'no'}">${p.ok ? '✓' : '✗'} ${esc(p.label)} → ${esc(p.given || '–')}</div>`).join('')}${ansHtml(it)}${appBtn(t, it, x.p.id)}${kiBox(x.p, t, it)}<textarea data-ef="${x.p.id}" rows="1" placeholder="Rückmeldung (optional)">${esc(g.feedback[x.p.id]?.[t.id] || '')}</textarea></div>`; }).join('')}
    <button class="btn pri" data-save>Speichern</button>`, { wide: true });
  d.el.onclick = ev => {
    if (appView(ev, null)) return;
    if (kiAction(ev, () => { d.close(); essayDialog(tid); })) return;
    if (!ev.target.closest('[data-save]')) return;
    for (const inp of $$('[data-ep]', d.el)) { const pid = +inp.dataset.ep, m = g.manual[pid] = g.manual[pid] || {}; if (inp.value.trim() === '') delete m[t.id]; else m[t.id] = Math.min(t.pts, Math.max(0, +inp.value.replace(',', '.'))); }
    for (const ta of $$('[data-ef]', d.el)) { const pid = +ta.dataset.ef, f = g.feedback[pid] = g.feedback[pid] || {}; if (ta.value.trim()) f[t.id] = ta.value.trim(); else delete f[t.id]; }
    saveGrading(); d.close(); drawEval();
  };
}
/** Lückentext / kurze Antwort: falsche Antworten zusätzlich als richtig akzeptieren (gilt für alle) */
function acceptDialog(tid) {
  const { esc } = X, { key, g, people } = S2, t = key.tasks.find(x => x.id === tid);
  const slots = t.type === 'gap' ? t.gaps.map((alts, i) => ({ i, label: `Lücke ${i + 1}`, exp: alts.join(' oder ') })) : [{ i: 0, label: 'Antwort', exp: String(t.answer).split('|').join(' oder ') }];
  const acc = g.accept[tid] = g.accept[tid] || {};
  const html = slots.map(s => {
    const okGap = (i, v) => v != null && String(v).trim() !== '' && (t.bank ? t.gaps[i].some(x => S2.M.normAns(x) === S2.M.normAns(v)) : S2.M.isAnswer(t.gaps[i].join('|'), v));
    const given = {}; for (const p of people) {
      const a = p.ans?.[tid], v = t.type === 'gap' ? a?.[s.i] : a; if (v == null || String(v).trim() === '') continue;
      if (t.type === 'gap' ? (S2.M.gapOks ? S2.M.gapOks(t.html, t.gaps.length, a, okGap)[s.i] : okGap(s.i, v)) : S2.M.isAnswer(t.answer, v)) continue; // richtig (auch „9 = 3x“ statt „3x = 9“)
      const k = String(v).trim(); given[k] = (given[k] || 0) + 1;
    }
    const wrong = Object.entries(given);
    return `<div class="pt"><b>${esc(s.label)}</b> <span class="help">richtig: ${esc(s.exp)}</span>${wrong.length ? wrong.map(([v, n]) => `<label class="ck"><input type="checkbox" data-a="${s.i}" value="${esc(v)}"${(acc[s.i] || []).includes(v) ? ' checked' : ''}>„${esc(v)}“ <span class="help">${n}×</span></label>`).join('') : '<div class="help">keine abweichenden Antworten</div>'}</div>`;
  }).join('');
  const d = X.dialog(`${esc(t.title)} – Antworten`, `<p class="help">Angekreuzte Antworten gelten für alle Schüler als richtig.</p>${html}<button class="btn pri" data-save>Speichern</button>`, { wide: true });
  d.el.onclick = ev => {
    if (!ev.target.closest('[data-save]')) return;
    const n = {}; for (const c of $$('[data-a]', d.el)) if (c.checked) (n[c.dataset.a] = n[c.dataset.a] || []).push(c.value);
    g.accept[tid] = n; saveGrading(); d.close(); drawEval();
  };
}
/** KI-Symbol (Funkelsterne) wie in PathFinder */
const KI = '<svg class="ki-ico" viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true"><path fill="currentColor" d="M10 2.5l1.7 5.3a3 3 0 0 0 1.9 1.9L19 11.5l-5.4 1.8a3 3 0 0 0-1.9 1.9L10 20.5l-1.7-5.3a3 3 0 0 0-1.9-1.9L1 11.5l5.4-1.8a3 3 0 0 0 1.9-1.9z"/><path fill="currentColor" d="M19 1.5l.8 2.2a1.4 1.4 0 0 0 .8.8l2.2.8-2.2.8a1.4 1.4 0 0 0-.8.8l-.8 2.2-.8-2.2a1.4 1.4 0 0 0-.8-.8l-2.2-.8 2.2-.8a1.4 1.4 0 0 0 .8-.8z"/></svg>';
/* ---------- KI-gestützte Korrektur (app/ki.js): Export ohne Namen, Vorschläge einlesen, je Aufgabe übernehmen oder ablehnen ---------- */
const kiOf = (pid, tid) => S2.g.ki?.[pid]?.[tid] || null;
/** offen = noch nicht entschieden und anders als die jetzige Bewertung; diff = davon weicht von bereits vergebenen Punkten ab */
function kiStats(x) {
  let open = 0, diff = 0, any = 0;
  S2.key.tasks.forEach((t, i) => {
    const k = kiOf(x.p.id, t.id), it = x.R.items[i]; if (!k || it.dropped) return; any++;
    if (k.st === 'neu' && k.pts !== it.pts) { open++; if (it.pts != null) diff++; }
  });
  const html = !any ? '' : open ? ` <span class="chip ki" title="KI-Vorschläge, die du noch nicht übernommen oder abgelehnt hast">${KI} KI: ${diff ? `${diff} abweichend` : `${open} Vorschlag${open > 1 ? 'e' : ''}`}${diff && open > diff ? ` · ${open - diff} offen` : ''}</span>` : ` <span class="chip ki soft" title="KI-Vorschläge stimmen mit deiner Bewertung überein oder sind entschieden">${KI} KI ✓</span>`;
  return { open, diff, any, html };
}
function kiSummary() {
  if (!S2.g.ki || !Object.keys(S2.g.ki).length) return '';
  const RS = results(), st = RS.map(kiStats), diffP = st.filter(k => k.diff).length, open = st.reduce((s, k) => s + k.open, 0);
  return `<span class="chip ki">${KI} ${open ? `${open} ${open === 1 ? 'offener Vorschlag' : 'offene Vorschläge'} · ${diffP} Schüler mit abweichender Bewertung` : 'alle KI-Vorschläge entschieden'}</span>`;
}
function kiBox(p, t, it) {
  const k = kiOf(p.id, t.id); if (!k || it.dropped) return '';
  const { esc, fmtPts } = X, same = k.pts === it.pts, ref = `${p.id}|${esc(t.id)}`;
  const head = `<b>${KI} KI-Vorschlag: ${fmtPts(k.pts)} / ${fmtPts(t.pts)} P.</b> <span class="help">${it.pts == null ? '(noch nicht bewertet)' : same ? '– stimmt mit der Bewertung überein' : `(jetzt ${fmtPts(it.pts)} P.)`}</span>`;
  const why = k.why ? `<div class="ki-why">${esc(k.why)}</div>` : '';
  if (k.st === 'ok' || k.st === 'nein' || same) return `<div class="ki-box soft">${head} ${k.st === 'ok' ? '<span class="chip ki soft">übernommen</span>' : k.st === 'nein' ? '<span class="chip">abgelehnt</span>' : ''}${why}${k.st !== 'neu' ? `<button class="btn sm ghost" data-kireset="${ref}">Entscheidung zurücknehmen</button>` : ''}</div>`;
  return `<div class="ki-box">${head}${why}<div class="btns" style="margin:6px 0 0"><button class="btn sm ki" data-kiok="${ref}">✓ Übernehmen</button><button class="btn sm" data-kino="${ref}">✗ Ablehnen</button></div></div>`;
}
/** Punkte eines Vorschlags eintragen: automatisch bewertete Aufgaben als Neubewertung, sonst als Punkte der Lehrkraft */
function kiTake(pid, tid) {
  const { key, g, M } = S2, k = kiOf(pid, tid), p = S2.people.find(x => x.id === pid), i = key.tasks.findIndex(t => t.id === tid);
  if (!k || !p || i < 0) return;
  const it = M.gradeExam(key, p.ans, { accept: g.accept, drop: g.drop, manual: g.manual[pid] }).items[i];
  if (it.auto) { const ov = g.override[pid] = g.override[pid] || {}; if (k.pts === it.pts) delete ov[tid]; else ov[tid] = k.pts; }
  else { (g.manual[pid] = g.manual[pid] || {})[tid] = k.pts; if (g.override[pid]) delete g.override[pid][tid]; }
  k.st = 'ok';
}
function kiAction(ev, reopen) {
  const b = ev.target.closest?.('[data-kiok],[data-kino],[data-kireset],[data-kiall]'); if (!b) return false;
  const [pid, tid] = (b.dataset.kiok || b.dataset.kino || b.dataset.kireset || '').split('|');
  if (b.dataset.kiok) kiTake(+pid, tid);
  if (b.dataset.kino) { const k = kiOf(+pid, tid); if (k) k.st = 'nein'; }
  if (b.dataset.kireset) { const k = kiOf(+pid, tid); if (k) k.st = 'neu'; }
  if (b.dataset.kiall) { const x = results().find(y => y.p.id === +b.dataset.kiall); S2.key.tasks.forEach((t, i) => { const k = kiOf(x.p.id, t.id); if (k && k.st === 'neu' && k.pts !== x.R.items[i].pts && !x.R.items[i].dropped) kiTake(x.p.id, t.id); }); }
  saveGrading(); drawEval(); reopen(); return true;
}
/** Export für die KI: zuerst die Aufgaben wählen (gemerkt in g.kiSel), dann nur diese samt Musterlösung exportieren */
const kiFree = t => t.type === 'essay' || (t.type === 'task' && !t.short) || t.type === 'app';
function kiExport() {
  const { esc, fmtPts } = X, { e, key, g } = S2, RS = results();
  const tasks = key.tasks.map((t, i) => ({ t, i })).filter(x => !g.drop.includes(x.t.id));
  const pre = new Set(Array.isArray(g.kiSel) && g.kiSel.some(id => tasks.some(x => x.t.id === id)) ? g.kiSel : tasks.filter(x => kiFree(x.t)).map(x => x.t.id));
  const typ = t => ({ quiz: 'Quiz', gap: 'Lückentext', match: 'Zuordnen', mark: 'Markieren', sort: 'Sortieren', order: t.words ? 'Satzpuzzle' : 'Reihenfolge', essay: 'Freitext', app: S2.M.appName(t.app) })[t.type] || (t.short ? 'kurze Antwort' : 'Freitext');
  const row = ({ t, i }) => {
    const its = RS.map(x => x.R.items[i]), open = its.filter(x => x.pts == null).length, notFull = its.filter(x => x.pts != null && x.pts < t.pts).length;
    return `<label class="ck ki-pick"><input type="checkbox" data-kisel="${esc(t.id)}"${pre.has(t.id) ? ' checked' : ''}><span><b>${i + 1}. ${esc(t.title)}</b> <span class="help">${esc(typ(t))} · ${fmtPts(t.pts)} P.${open ? ` · ${open} noch nicht bewertet` : ''}${notFull ? ` · ${notFull}× nicht volle Punkte` : ''}</span></span></label>`;
  };
  const d = X.dialog(`${KI} KI-Korrektur: Export`, `<p class="help">Welche Aufgaben soll die KI korrigieren? Exportiert werden nur diese Aufgaben – mit Musterlösung, Erwartungshorizont und dem Material davor – und die Antworten aller Schüler dazu, <b>ohne Namen</b>. Weniger Aufgaben = kürzerer Text, weniger Tokens.</p>
    <div class="btns" style="margin:0 0 6px"><button class="btn sm" data-kiq="free">Freitext und Programmieren</button><button class="btn sm" data-kiq="all">alle</button><button class="btn sm" data-kiq="none">keine</button></div>
    <div class="ki-list">${tasks.map(row).join('')}</div>
    <div class="btns"><button class="btn pri ki" data-kigo>${KI} Export erstellen</button><span class="help" data-kicount></span></div><div data-kiout></div>`, { wide: true });
  const sel = () => $$('[data-kisel]', d.el).filter(c => c.checked).map(c => c.dataset.kisel);
  const count = () => { const n = sel().length; $('[data-kicount]', d.el).textContent = n ? `${n} Aufgabe${n > 1 ? 'n' : ''} · ${RS.length} Schüler` : 'Bitte mindestens eine Aufgabe wählen.'; $('[data-kigo]', d.el).disabled = !n; $('[data-kiout]', d.el).innerHTML = ''; };
  count();
  let txt = '';
  d.el.onchange = ev => { if (ev.target.matches('[data-kisel]')) count(); };
  d.el.onclick = async ev => {
    const q = ev.target.closest('[data-kiq]');
    if (q) { $$('[data-kisel]', d.el).forEach(c => { const t = key.tasks.find(x => x.id === c.dataset.kisel); c.checked = q.dataset.kiq === 'all' || (q.dataset.kiq === 'free' && kiFree(t)); }); count(); return; }
    if (ev.target.closest('[data-kigo]')) {
      const ids = sel(); if (!ids.length) return;
      g.kiSel = ids; saveGrading();
      try { txt = await X.withBusy('Export wird erstellt …', async () => buildExport(S2, RS, ids)); } catch (er) { X.toast('⚠ ' + esc(er.message), 5000); return; }
      $('[data-kiout]', d.el).innerHTML = `<div class="ki-box soft"><b>Export fertig</b> <span class="help">${(txt.length / 1024).toFixed(0)} KB · etwa ${Math.round(txt.length / 3.5 / 1000)}k Tokens</span>
        <ol class="help"><li>Datei herunterladen (oder Text kopieren) und in der KI deiner Wahl hochladen bzw. einfügen.</li><li>Die Antwort der KI hier unter „KI-Vorschläge einlesen“ einfügen.</li><li>Bei jedem Schüler die Vorschläge je Aufgabe übernehmen oder ablehnen.</li></ol>
        <p class="help">Namen, die ein Schüler in eine Antwort geschrieben hat, sind durch [Name] ersetzt. Prüfe trotzdem, ob die Antworten persönliche Angaben enthalten, und beachte die Vorgaben deiner Schule zum Einsatz von KI.</p>
        <div class="btns"><button class="btn pri" data-dl>⇩ Datei herunterladen</button><button class="btn" data-cp>Text kopieren</button></div></div>`;
      return;
    }
    if (ev.target.closest('[data-dl]')) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/markdown' })); a.download = `KI-Korrektur_${e.klasse}_${e.fach}_${e.datum}.md`.replace(/[^\wäöüÄÖÜß.-]+/g, '_'); a.click(); }
    if (ev.target.closest('[data-cp]')) { try { await navigator.clipboard.writeText(txt); X.toast('✓ kopiert'); } catch (er) { X.toast('⚠ Kopieren nicht möglich – bitte die Datei nehmen'); } }
  };
}
function kiImport() {
  const { esc } = X, has = S2.g.ki && Object.keys(S2.g.ki).length;
  const d = X.dialog(`${KI} KI-Vorschläge einlesen`, `<p class="help">Füge die ganze Antwort der KI ein – auch wenn sie aus vielen einzelnen JSON-Schnipseln mit Text dazwischen besteht; Probe sammelt alle Bewertungen heraus. Teil-Antworten kannst du nacheinander einlesen. Die Vorschläge erscheinen pink mit ${KI} bei jedem Schüler; an deiner Bewertung ändert sich erst etwas, wenn du einen Vorschlag übernimmst.</p>
    <textarea id="kiT" rows="10" placeholder='{"probe":"ki-korrektur", … }'></textarea><div class="err" id="kiErr"></div>
    <div class="btns"><button class="btn pri" data-go>Einlesen</button><button class="btn" data-file>Datei wählen</button>${has ? '<span class="sp"></span><button class="btn danger" data-clear>Alle KI-Vorschläge entfernen</button>' : ''}</div>`, { wide: true });
  d.el.onclick = async ev => {
    if (ev.target.closest('[data-file]')) { X.pickFile('.json,.txt,.md,application/json,text/plain', async f => { $('#kiT', d.el).value = await f.text(); }); return; }
    if (ev.target.closest('[data-clear]')) { if (!confirm('Alle KI-Vorschläge entfernen? Bereits übernommene Punkte bleiben.')) return; delete S2.g.ki; saveGrading(); d.close(); drawEval(); return; }
    if (!ev.target.closest('[data-go]')) return;
    const P = parseImport($('#kiT', d.el).value);
    if (!P.rows.length) { $('#kiErr', d.el).textContent = 'Keine Bewertungen gefunden. Erwartet wird ein JSON-Block mit "bewertungen".'; return; }
    const r = await applyImport(S2, P);
    if (r.wrongExam && !r.ok) { $('#kiErr', d.el).textContent = 'Diese Vorschläge gehören zu einer anderen Prüfung.'; return; }
    saveGrading(); d.close(); drawEval();
    X.toast(`${KI} ${r.ok} Vorschläge eingelesen${r.unknown.size ? ` · ${r.unknown.size} unbekannte Kennung${r.unknown.size > 1 ? 'en' : ''}` : ''}${r.bad ? ` · ${r.bad} ungültig` : ''}${r.wrongExam ? ' · ⚠ Prüfungscode passt nicht' : ''}`, 6000);
  };
}
/** Quittieren: für jeden Schüler einen Bericht, verschlüsselt mit seinem Ergebniscode */
async function publish() {
  const { esc } = X, { e, key, g } = S2, RS = results(), pend = RS.reduce((s, x) => s + x.R.pending, 0);
  const days = prompt(`${pend ? `Achtung: ${pend} Freitext-Antwort${pend === 1 ? ' ist' : 'en sind'} noch nicht bewertet (zählen mit 0 Punkten).\n\n` : ''}Wie viele Tage sollen die Schüler ihre Ergebnisseite abrufen können?`, String(g.days || 14));
  if (days == null) return; g.days = Math.max(1, Math.min(90, parseInt(days) || 14));
  try {
    await X.withBusy('Ergebnisseiten werden verschlüsselt …', async () => {
      const reports = [];
      for (const x of RS) {
        if (!x.p.rc) continue;
        const fb = g.feedback[x.p.id] || {};
        const rep = { v: 1, exam: { titel: e.titel, fach: e.fach, klasse: e.klasse, art: e.art, datum: e.datum }, name: `${x.p.v} ${x.p.n}`, skala: e.skala, note: x.note,
          punkte: x.R.total, max: x.R.max, pct: x.R.pct, pub: X.S.keys.pub_key,
          items: x.R.items.map((it, i) => ({ id: it.id, title: it.title, pts: it.pts || 0, max: key.tasks[i].pts, dropped: !!it.dropped, parts: it.parts, ...(it.answer ? { answer: it.answer } : {}), text: it.text != null ? it.text : it.auto ? undefined : '', ...(it.type === 'app' ? { code: true } : {}), rubric: key.tasks[i].rubric || [], feedback: fb[it.id] || '' })) };
        for (const rc of [x.p.rc, ...x.p.merged.map(q => q.rc)].filter(Boolean)) { // doppelt angemeldet: unter jedem Ergebniscode dieselbe Seite
          const { rid, key: k } = await X.K.reportKeys(rc);
          reports.push({ rid, report_enc: await X.K.sealSym(k, rep) });
        }
      }
      const r = await X.api('exam_publish', { id: e.id, reports, days: g.days });
      S2.e = { ...S2.e, ...r.exam };
      await X.api('exam_grading', { id: e.id, grading_enc: await X.K.seal(X.S.keys.pub_key, g) });
    });
    X.toast(`✓ ${RS.filter(x => x.p.rc).length} Ergebnisseiten veröffentlicht`); drawEval();
  } catch (er) { X.toast('⚠ ' + esc(er.message), 5000); }
}
/** Vorschau: Ergebnisseite eines Schülers öffnen (nur nach dem Veröffentlichen) */
export const resultLink = rc => new URL('e.html', location.href).href.replace(/[?#].*$/, '') + '#' + rc;
