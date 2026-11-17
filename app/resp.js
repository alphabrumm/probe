// Probe – Respizienz: Die Lehrkraft reicht eine korrigierte Prüfung mit Klarnamen bei der Fachleitung ein.
// Das Paket (Prüfung mit Lösungen, Antworten, Bewertung) wird im Browser der Lehrkraft für jede Fachleitung einzeln verschlüsselt;
// der Server sieht nur Klasse, Fach, Datum und Status.
let X; // Hilfen aus probe.js: S, api, K, dialog, toast, withBusy, esc, fmtDate, fmtPts, main, view
const $ = (s, r = document) => r.querySelector(s);
const STAT = { eingereicht: ['eingereicht', 'warn'], gesehen: ['gesehen', ''], abgezeichnet: ['✓ abgezeichnet', 'good'] };
const chip = s => `<span class="chip ${STAT[s]?.[1] || ''}">${STAT[s]?.[0] || s}</span>`;
const when = t => t ? new Date(t * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';

/* ---------- Lehrkraft: Stand und Einreichen (in der Auswertung) ---------- */
export async function respState(e, H) {
  X = H;
  const r = await X.api('resp_targets', { id: e.id });
  if (r.last?.note_enc) { try { r.last.note = (await X.K.open(X.S.priv, r.last.note_enc)).t; } catch (er) { } }
  return r;
}
export function respHtml(R) {
  const { esc } = X;
  if (!R) return '';
  if (R.demo) return '<p class="help">Hier reichst du eine fertig korrigierte Prüfung mit einem Klick bei deiner Fachleitung ein. Im Demo-Modus ist das abgeschaltet – Demo-Prüfungen gehen nie an echte Fachleitungen.</p>';
  const who = R.to.map(u => esc(u.name || u.kuerzel)).join(', ');
  const L = R.last;
  const state = L ? `<p>${chip(L.status)} Eingereicht am ${when(L.created)}${L.seen ? ` · gesehen am ${when(L.seen)}` : ''}${L.signed ? ` · abgezeichnet von ${esc(L.signer)} am ${when(L.signed)}` : ''}</p>${L.note ? `<div class="ans">💬 ${esc(L.note)}</div>` : ''}` : '';
  if (!R.fachschaft) return `<p class="help">Für dieses Fach ist keine Fachschaft eingetragen – deshalb kann die Prüfung nicht zur Respizienz gehen. Der Admin ordnet Fächer unter „Fachschaften“ zu.</p>${state}`;
  if (!R.to.length) return `<p class="help">Die Fachschaft ${esc(R.fachschaft.name)} hat noch keine Fachleitung mit eingerichtetem Konto – deshalb kann die Prüfung noch nicht zur Respizienz gehen. Der Admin vergibt die Rolle bei den Lehrkräften.</p>${state}`;
  return `${state}<div class="btns"><button class="btn${L ? '' : ' pri'}" id="resp">📤 ${L ? 'Erneut einreichen' : 'Zur Respizienz einreichen'}</button></div>
    <p class="help">Geht an die Fachleitung ${esc(R.fachschaft.name)}: ${who}. Sie sieht die Prüfung mit Lösungen, alle Antworten, Punkte und Noten mit Namen. ${L ? 'Erneutes Einreichen ersetzt die bisherige Fassung.' : ''}</p>`;
}
/** Paket bauen und für jede Fachleitung verschlüsseln */
export async function respSubmit(S2, R) {
  const { esc } = X, { e, key, g, people } = S2;
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

/* ---------- Fachleitung: Übersicht ---------- */
export async function viewRespList(H) {
  X = H; const { esc, main } = X;
  main.innerHTML = '<p class="help">lädt …</p>';
  let L; try { L = (await X.api('resp_list')).items; } catch (er) { main.innerHTML = `<p class="err">${esc(er.message)}</p>`; return; }
  const fs = X.S.user.fachleitung.map(f => esc(f.name)).join(', ');
  const offen = L.filter(r => r.status !== 'abgezeichnet').length;
  main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a><h1>Respizienz</h1><p class="sub">Fachleitung ${fs} · ${L.length ? `${L.length} eingereicht, ${offen} noch nicht abgezeichnet` : 'noch nichts eingereicht'}</p>
    <section class="card">${L.length ? `<div class="scroll-x"><table class="t"><tr><th>Datum</th><th>Klasse</th><th>Fach · Art</th><th>Lehrkraft</th><th>Teilnehmer</th><th>Eingereicht</th><th>Stand</th></tr>
      ${L.map(r => `<tr data-r="${r.id}" style="cursor:pointer"><td>${esc(X.fmtDate(r.datum))}</td><td><b>${esc(r.klasse)}</b></td><td>${esc(r.fach)} · ${esc(r.art)}<div class="help">${esc(r.titel)}</div></td><td>${esc(r.lehrkraft)}</td><td>${r.teilnehmer}</td><td>${when(r.created)}</td><td>${chip(r.status)}</td></tr>`).join('')}</table></div>`
      : '<p class="help">Sobald eine Lehrkraft eine korrigierte Prüfung zur Respizienz einreicht, erscheint sie hier.</p>'}</section>`;
  main.onclick = ev => { const t = ev.target.closest('[data-r]'); if (t) location.hash = '#/resp/' + t.dataset.r; };
}

/* ---------- Fachleitung: eine Prüfung durchsehen ---------- */
export async function viewResp(id, H) {
  X = H; const { esc, main, fmtPts } = X;
  main.innerHTML = '<p class="help">Wird entschlüsselt …</p>';
  let r, P, M;
  try {
    r = (await X.api('resp_get', { rid: id })).item;
    P = await X.K.open(X.S.priv, r.data_enc);
    M = await import('../vendor/pathfinder/core/pfsplit.js');
  } catch (er) { main.innerHTML = `<a class="back" href="#/resp">‹ Respizienz</a><p class="err">${esc(er.message || 'Konnte nicht entschlüsselt werden.')}</p>`; return; }
  const { exam: E, key, g } = P, pts = E.skala === 'punkte';
  const gkey = g.gkey || (pts ? M.POINTS_KEY : M.GRADE_KEY);
  const RS = P.people.map(p => { const R = M.gradeExam(key, p.ans, { manual: g.manual?.[p.id], override: g.override?.[p.id], accept: g.accept, drop: g.drop }); return { p, R, note: pts ? M.pointsFor(R.pct, gkey) : M.gradeFor(R.pct, gkey) }; })
    .sort((a, b) => a.p.n.localeCompare(b.p.n, 'de') || a.p.v.localeCompare(b.p.v, 'de'));
  const max = RS[0]?.R.max ?? key.tasks.reduce((s, t) => s + t.pts, 0);
  const grades = pts ? Array.from({ length: 16 }, (_, i) => 15 - i) : [1, 2, 3, 4, 5, 6];
  const cnt = Object.fromEntries(grades.map(n => [n, RS.filter(x => x.note === n).length])), top = Math.max(1, ...Object.values(cnt));
  const avg = RS.length ? RS.reduce((s, x) => s + x.note, 0) / RS.length : 0, bad = pts ? RS.filter(x => x.note < 5).length : (cnt[5] || 0) + (cnt[6] || 0);
  const col = n => pts ? (n >= 10 ? '#2f8a5b' : n >= 5 ? '#e8961e' : '#c0392b') : ({ 1: '#2f8a5b', 2: '#5aa66f', 3: '#a3b83b', 4: '#e8b21e', 5: '#e57a2b', 6: '#c0392b' })[n];
  const keyRows = pts ? gkey.map((v, i) => [i + 1, v]).reverse() : gkey.map((v, i) => [5 - i, v]).reverse();
  const pending = RS.reduce((s, x) => s + x.R.pending, 0);
  const signed = r.status === 'abgezeichnet';
  main.innerHTML = `<div class="printme resp-view"><a class="back" href="#/resp">‹ Respizienz</a>
    <h1>${esc(E.klasse)} · ${esc(E.fach)} · ${esc(E.art)}</h1><p class="sub">${esc(E.titel)} · ${esc(X.fmtDate(E.datum))} · Lehrkraft: ${esc(r.lehrkraft)} · eingereicht am ${when(r.created)}</p>
    <section class="card"><div class="bar" style="margin:0"><h2 style="margin:0">${signed ? `✓ Abgezeichnet von ${esc(r.signer)} am ${when(r.signed)}` : 'Durchsicht'}</h2><span class="sp"></span>${pending ? `<span class="chip warn">${pending} Freitext-Antworten ohne Bewertung</span>` : '<span class="chip good">vollständig bewertet</span>'}</div>
      <div class="btns" style="margin-top:12px"><button class="btn${signed ? '' : ' pri'}" id="sign">✓ ${signed ? 'Erneut abzeichnen' : 'Abzeichnen'}</button>${P.doc ? '<button class="btn" id="look">👁 Prüfung ansehen</button>' : ''}<button class="btn" id="print">🖨 Drucken / PDF</button></div>
      <p class="help">Abzeichnen bestätigt der Lehrkraft die Durchsicht; eine Bemerkung dazu sieht nur sie.</p></section>
    <div class="grid2" style="margin-top:16px"><section class="card"><h2>Verteilung</h2><div class="dist${pts ? ' pts' : ''}">${grades.map(n => `<div class="db"><span class="dc">${cnt[n] || ''}</span><i style="height:${Math.round(100 * cnt[n] / top)}%;background:${col(n)}"></i><span class="dl">${n}</span></div>`).join('')}</div>
      <p><b>Durchschnitt: ${RS.length ? avg.toFixed(2).replace('.', ',') : '–'}</b>${pts ? ' Punkte' : ''} · ${RS.length} Teilnehmer · ${pts ? 'unter 5 Punkten' : 'Note 5 und 6'}: ${bad}</p></section>
      <section class="card"><h2>Notenschlüssel</h2><table class="t"><tr><th>${pts ? 'Punkte' : 'Note'}</th><th>ab</th><th></th></tr>${keyRows.map(([n, v]) => `<tr><td><b>${n}</b></td><td>${v} %</td><td class="help">ab ${fmtPts(Math.ceil(max * v / 100 * 2) / 2)} von ${fmtPts(max)} P.</td></tr>`).join('')}</table>
      ${JSON.stringify(gkey) !== JSON.stringify(pts ? M.POINTS_KEY : M.GRADE_KEY) ? '<p class="help">⚠ weicht vom Abiturschlüssel ab</p>' : '<p class="help">Abiturschlüssel</p>'}</section></div>
    <section class="card" style="margin-top:16px"><h2>Ergebnisse</h2><div class="scroll-x"><table class="t"><tr><th>Name</th><th>Punkte</th><th>%</th><th>${pts ? 'Punkte (0–15)' : 'Note'}</th></tr>
      ${RS.map(x => `<tr data-p="${x.p.id}" style="cursor:pointer"><td><b>${esc(x.p.n)}</b>, ${esc(x.p.v)}${x.p.imported ? ' <span class="chip">Datei</span>' : ''}${x.p.fokus ? ` <span class="chip warn">${x.p.fokus}× Fokus</span>` : ''}</td><td>${fmtPts(x.R.total)} / ${fmtPts(x.R.max)}</td><td>${Math.round(x.R.pct)}</td><td><b>${x.note}</b></td></tr>`).join('')}</table></div>
      <p class="help noprint">Zeile antippen: Antworten und Bewertung dieses Schülers.</p></section>
    <section class="card" style="margin-top:16px"><h2>Aufgaben</h2><div class="scroll-x"><table class="t"><tr><th>Aufgabe</th><th>Ø Punkte</th><th></th></tr>
      ${key.tasks.map((t, i) => { const its = RS.map(x => x.R.items[i]), dropped = (g.drop || []).includes(t.id); const a = its.length ? its.reduce((s, x) => s + (x.pts || 0), 0) / its.length : 0;
        return `<tr><td><b>${i + 1}. ${esc(t.title)}</b> <span class="help">${esc({ quiz: 'Quiz', gap: 'Lückentext', match: 'Zuordnen', task: t.short ? 'kurze Antwort' : 'Freitext', essay: 'Freitext' }[t.type] || t.type)}</span></td><td>${dropped ? '–' : `${fmtPts(Math.round(a * 10) / 10)} / ${fmtPts(t.pts)}`}</td><td>${dropped ? '<span class="chip">gestrichen</span>' : ''}${Object.keys(g.accept?.[t.id] || {}).length ? ' <span class="chip">weitere Antworten akzeptiert</span>' : ''}</td></tr>`; }).join('')}</table></div></section></div>`;
  $('#print').onclick = () => print();
  $('#look') && ($('#look').onclick = () => X.view({ id: 0, klasse: E.klasse, fach: E.fach, art: E.art, dauer: E.dauer, draft: P.doc }));
  $('#sign').onclick = () => {
    const d = X.dialog('Abzeichnen', `<p>Prüfung ${esc(E.klasse)} · ${esc(E.fach)} von ${esc(r.lehrkraft)} als durchgesehen abzeichnen.</p>
      <label class="f">Bemerkung für die Lehrkraft (optional)<textarea id="t" rows="4" placeholder="z. B. Notenschlüssel passt, Aufgabe 3 bitte großzügiger bewerten …"></textarea><span class="h">Wird verschlüsselt – nur die Lehrkraft kann sie lesen.</span></label><button class="btn pri" id="go">✓ Abzeichnen</button>`);
    $('#go', d.el).onclick = async () => {
      const t = $('#t', d.el).value.trim();
      try {
        await X.api('resp_sign', { rid: id, note_enc: t && r.owner_pub ? await X.K.seal(r.owner_pub, { t, at: Date.now() }) : null });
        d.close(); X.toast('✓ Abgezeichnet'); viewResp(id, H);
      } catch (er) { X.toast('⚠ ' + esc(er.message)); }
    };
  };
  main.onclick = ev => {
    const t = ev.target.closest('[data-p]'); if (!t) return;
    const x = RS.find(y => y.p.id === +t.dataset.p), fb = g.feedback?.[x.p.id] || {};
    X.dialog(`${esc(x.p.v)} ${esc(x.p.n)} · ${fmtPts(x.R.total)} / ${fmtPts(x.R.max)} P. · ${pts ? '' : 'Note '}${x.note}`, key.tasks.map((tk, i) => {
      const it = x.R.items[i];
      return `<div class="pt"><div class="bar" style="margin:0"><b>${i + 1}. ${esc(tk.title)}</b><span class="sp"></span>${it.dropped ? '<span class="chip">gestrichen</span>' : `${it.pts == null ? '?' : fmtPts(it.pts)} / ${fmtPts(tk.pts)} P.`}</div>
        ${it.parts.map(p => `<div class="ex-part ${p.ok ? 'ok' : 'no'}">${p.ok ? '✓' : '✗'} ${esc(p.label)} → ${esc(p.given || '–')}${p.ok ? '' : ` <span class="help">richtig: ${esc(p.expected)}</span>`}</div>`).join('')}
        ${!it.auto ? `<div class="ans">${esc(it.text || '– keine Antwort –')}</div>${tk.rubric?.length ? `<div class="help">Erwartung: ${tk.rubric.map(q => `${esc(q.t)} (${fmtPts(q.p)})`).join(' · ')}</div>` : ''}` : ''}
        ${it.overridden ? '<div class="help">Punkte von der Lehrkraft geändert.</div>' : ''}${fb[tk.id] ? `<div class="help">Rückmeldung: ${esc(fb[tk.id])}</div>` : ''}</div>`;
    }).join(''), { wide: true });
  };
}
