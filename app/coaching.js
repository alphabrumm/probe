// Probe – Coaching (Lerncoaching der Klassleitung): Fragebogen per persönlichem QR-Code, Klassen-Dashboard,
// Coachinggespräch (links Notizen, rechts der Fragebogen), Druck für den Safe, verschlüsselter Export, Übergabe an die
// nächste Klassleitung (nur mit Einwilligung, nur Ziele/Hilfen/Ergebnisse), anonymisierte Zahlen für die Schulberatung.
//
// Schutz: Klassenliste, Fragebögen und Notizen sind mit dem Schlüssel der Lehrkraft verschlüsselt (ECDH P-256 + AES-256-GCM),
// der Server sieht nur Klasse, Titel, Vorlagen und Zähler. Admins können Coaching-Daten löschen, aber nicht lesen.
// Probe löscht nie von selbst: Ab dem 15. Juli erinnert es bei jeder Anmeldung an Export oder Löschen.
import { VORLAGEN, REFLEXION, GESPRAECH, formHtml, readForm, viewHtml, printHtml, stats, statsHtml, anon, addStats, questions, answered } from './cvorlagen.js';
import { Pdf, PAGE_W, PAGE_H, fit, wrap, showPdf } from './pdf.js';
import { qrMatrix, qrSvg } from './qr.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const te = new TextEncoder();
const hex = u8 => [...new Uint8Array(u8)].map(x => x.toString(16).padStart(2, '0')).join('');
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const tidOf = async t => hex(await crypto.subtle.digest('SHA-256', te.encode('probe-coaching|' + t)));
const newToken = () => b64u(crypto.getRandomValues(new Uint8Array(16)));
const personalLink = (code, r) => `${new URL('c.html', location.href).href.replace(/[?#].*$/, '')}?c=${code}#p=${b64u(te.encode(JSON.stringify({ v: r.v, n: r.n, t: r.t })))}`;
const fullName = r => `${r.v} ${r.n}`.trim();
const today = () => new Date().toISOString().slice(0, 10);
const deDate = d => d ? new Date((/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00' : d)).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const sjEnd = sj => new Date(+String(sj).slice(0, 4) + 1, 6, 15); // 15. Juli am Ende des Schuljahres
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };
const safe = s => String(s).replace(/[^\wäöüÄÖÜß-]+/g, '_');

export const tabsHtml = (on, S) => `<nav class="c-tabs"><a href="#/"${on === 'p' ? ' class="on"' : ''}>Prüfungen</a><a href="#/coaching"${on === 'c' ? ' class="on"' : ''}>Coaching</a>${S?.user?.is_berater || S?.user?.is_demo ? `<a href="#/berater"${on === 'b' ? ' class="on"' : ''}>Schulberatung</a>` : ''}</nav>`;

/* ---------- Daten eines Coachings laden und entschlüsseln ---------- */
async function load(H, id) {
  const { S, api, K } = H, r = await api('c_get', { id }), c = r.coaching;
  const R = r.roster_enc ? await K.open(S.priv, r.roster_enc) : [];
  for (const x of R) x.tid = await tidOf(x.t);
  const by = new Map(R.map(x => [x.tid, x])), extra = [];
  for (const s of r.subs) {
    let idn = null, ans = null; try { idn = await K.open(S.priv, s.identity_enc); ans = await K.open(S.priv, s.answers_enc); } catch (e) { continue; }
    const x = by.get(s.tid); const sub = { answers: ans.answers || {}, at: Math.min(+ans.at || Infinity, s.at * 1000), n: s.n }; // Zeit des Geräts (nie später als beim Server angekommen)
    if (x) x.sub = sub; else extra.push({ v: idn.v, n: idn.n, tid: s.tid, sub, unknown: true });
  }
  for (const n of r.notes) { const x = by.get(n.tid); if (!x) continue; try { x.note = await K.open(S.priv, n.note_enc); } catch (e) { } }
  return { c, R, extra, rTpl: VORLAGEN[c.vorlage], gTpl: VORLAGEN[c.gbogen] };
}
const people = D => [...D.R, ...D.extra];

/* ---------- Übersicht ---------- */
export async function viewCoachingList(H) {
  const { S, api, main, esc } = H;
  main.innerHTML = tabsHtml('c', S) + '<p class="help">lädt …</p>';
  let L; try { L = (await api('c_list')).coachings; } catch (e) { main.innerHTML = tabsHtml('c', S) + `<p class="err">${esc(e.message)}</p>`; return; }
  if (S.user.is_demo && !L.length && !S.cDemo) { S.cDemo = true; try { await createExample(H, true); L = (await api('c_list')).coachings; } catch (e) { H.toast('⚠ ' + esc(e.message)); } }
  const old = L.filter(c => Date.now() >= sjEnd(c.schuljahr));
  const bySj = {}; for (const c of L) (bySj[c.schuljahr] = bySj[c.schuljahr] || []).push(c);
  main.innerHTML = `${tabsHtml('c', S)}<h1>Lerncoaching</h1><p class="sub">Selbstreflexion vor dem Gespräch, Gesprächsnotizen und Klassenüberblick – nur du kannst sie lesen.</p>
    ${old.length ? `<div class="c-hint"><b>⏰ Schuljahr vorbei:</b> ${old.length} Coaching${old.length === 1 ? '' : 's'} aus ${[...new Set(old.map(c => c.schuljahr))].join(', ')}. Bitte verschlüsselt exportieren oder löschen – Probe löscht nichts von selbst. <button class="btn sm" data-hint>Jetzt erledigen</button></div>` : ''}
    <div class="bar"><button class="btn pri" id="neu">＋ Neues Coaching</button><button class="btn" id="open">📂 Datei öffnen</button><span class="sp"></span><button class="btn sm ghost" id="demo" title="Erfundene Klasse mit Beispielantworten zum Ausprobieren">Demo-Coaching anlegen</button></div>
    ${L.length ? Object.keys(bySj).sort().reverse().map(sj => `<div class="klasse"><h2>${esc(sj)}</h2></div><div class="tiles">${bySj[sj].map(c => `<a class="tile" href="#/c/${c.id}">
      <span class="k">Klasse ${esc(c.klasse)}</span><span class="t">${esc(c.titel || 'Lerncoaching')}</span><span class="m">${esc(VORLAGEN[c.vorlage]?.label || c.vorlage)}</span>
      <span class="s"><span class="chip ${c.n_subs ? 'good' : ''}">📝 ${c.n_subs}/${c.roster_n} Fragebögen</span><span class="chip ${c.n_done ? 'good' : ''}">💬 ${c.n_done}/${c.roster_n} Gespräche</span>${c.open ? '' : '<span class="chip">geschlossen</span>'}${c.reported ? '<span class="chip good">✓ an Schulberatung</span>' : ''}${c.exported ? '<span class="chip">⇩ exportiert</span>' : ''}</span></a>`).join('')}</div>`).join('')
      : `<div class="empty"><img src="app/icon.svg" alt=""><h2>Noch kein Coaching</h2><p>Lege ein Coaching für deine Klasse an: Klassenliste einfügen, persönliche QR-Codes drucken – die Kinder füllen vor dem Gespräch ihre Selbstreflexion aus.</p></div>`}`;
  $('#neu').onclick = () => coachingForm(H, null);
  $('#open').onclick = () => openFile(H);
  $('#demo').onclick = () => createExample(H);
  $('[data-hint]', main) && ($('[data-hint]', main).onclick = () => yearEndDialog(H, old));
}

/** nach der Anmeldung: ab dem 15. Juli bei jeder Anmeldung an Export/Löschen erinnern (nie selbst löschen) */
export async function coachingHint(H) {
  try { const L = (await H.api('c_list')).coachings, old = L.filter(c => Date.now() >= sjEnd(c.schuljahr)); if (old.length) yearEndDialog(H, old); } catch (e) { }
}
function yearEndDialog(H, old) {
  const { dialog, esc, api, toast } = H;
  const d = dialog('⏰ Coaching-Notizen: Schuljahr vorbei', `<p>Gesprächsnotizen und Fragebögen werden nur ein Schuljahr aufbewahrt. Bitte <b>verschlüsselt exportieren</b> (Datei mit Passphrase, z. B. für den Schul-Safe) und danach <b>löschen</b>. Probe löscht nichts von selbst und erinnert dich bei jeder Anmeldung.</p>
    <table class="c-table">${old.map(c => `<tr><td><b>${esc(c.klasse)}</b> · ${esc(c.titel)}<br><span class="help">${esc(c.schuljahr)} · ${c.n_done} Gespräche</span></td><td>${c.exported ? `<span class="chip good">⇩ exportiert ${esc(deDate(new Date(c.exported * 1000)))}</span>` : '<span class="chip warn">nicht exportiert</span>'}</td><td><button class="btn sm danger" data-del="${c.id}">Löschen</button></td></tr>`).join('')}</table>
    <div class="btns" style="margin-top:14px"><button class="btn pri" data-exp>⇩ Alle verschlüsselt exportieren</button><button class="btn" data-close>Später erinnern</button></div>`, { wide: true });
  d.el.onclick = async e => {
    if (e.target.closest('[data-exp]')) { d.close(); await exportDialog(H, old.map(c => c.id)); return; }
    const b = e.target.closest('[data-del]'); if (!b) return;
    const c = old.find(x => x.id === +b.dataset.del);
    if (!c.exported && !confirm(`${c.klasse} ist noch nicht exportiert. Trotzdem endgültig löschen?`)) return;
    if (!confirm(`Coaching ${c.klasse} „${c.titel}“ mit allen Fragebögen und Gesprächsnotizen endgültig löschen?`)) return;
    await api('c_delete', { id: c.id }); toast('🗑 gelöscht'); b.closest('tr').remove();
  };
}

/* ---------- Anlegen und Bearbeiten ---------- */
async function coachingForm(H, D) {
  const { S, api, K, dialog, esc, field, toast, withBusy, parseNames } = H, c = D?.c;
  const names = D ? D.R.map(r => `${r.n}, ${r.v}`).join('\n') : '';
  const d = dialog(c ? `Coaching ${esc(c.klasse)} bearbeiten` : 'Neues Coaching', `
    <div class="row">${field('Klasse', `<input type="text" id="kl" value="${esc(c?.klasse || '')}" placeholder="z. B. 7c">`)}${field('Titel', `<input type="text" id="ti" value="${esc(c?.titel || `Lerncoaching ${new Date().getMonth() >= 1 && new Date().getMonth() < 7 ? '2' : '1'}. Halbjahr`)}">`)}</div>
    <div class="row">${field('Selbstreflexion der Schüler:innen', `<select id="vo">${REFLEXION.map(v => `<option value="${v.id}"${(c?.vorlage || 'rk') === v.id ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}${field('Gesprächsbogen', `<select id="gb">${GESPRAECH.map(v => `<option value="${v.id}"${(c?.gbogen || 'gf') === v.id ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}</div>
    ${field('Klassenliste', `<textarea id="nl" rows="7" placeholder="Nachname, Vorname – je Zeile, oder CSV einfügen">${esc(names)}</textarea>`, 'Wird verschlüsselt gespeichert. Für jede:n entsteht ein persönlicher QR-Code; bei gleichen Namen bleiben gedruckte Codes gültig.')}
    <div class="btns" style="margin:-4px 0 10px"><button class="btn sm" id="csvf">⤒ Klassenliste einlesen</button><span class="help">CSV oder Text aus der Schulverwaltung (z. B. ASV) oder aus Moodle</span></div>
    <div class="err" id="err"></div><button class="btn pri" id="go">${c ? 'Speichern' : 'Anlegen'}</button>`, { wide: true });
  $('#csvf', d.el).onclick = () => H.pickFile('.csv,.txt,text/csv,text/plain', async f => { const L = parseNames(await f.text()); if (!L.length) { $('#err', d.el).textContent = 'In der Datei wurden keine Namen erkannt.'; return; } $('#nl', d.el).value = L.map(r => `${r.n}, ${r.v}`).join('\n'); $('#err', d.el).textContent = ''; toast(`✓ ${L.length} Namen eingelesen`); });
  $('#go', d.el).onclick = async () => {
    const klasse = $('#kl', d.el).value.trim(), L = parseNames($('#nl', d.el).value);
    if (!klasse) { $('#err', d.el).textContent = 'Bitte die Klasse angeben.'; return; }
    if (!L.length) { $('#err', d.el).textContent = 'Bitte die Klassenliste einfügen.'; return; }
    const old = new Map((D?.R || []).map(r => [`${r.n}|${r.v}`.toLowerCase(), r.t]));
    const R = L.map(r => ({ v: r.v, n: r.n, t: old.get(`${r.n}|${r.v}`.toLowerCase()) || newToken() }));
    const keep = (D?.R || []).filter(r => (r.sub || r.note) && !R.some(x => x.t === r.t)); // wer schon Fragebogen oder Gespräch hat, bleibt
    if (keep.length && !confirm(`${keep.map(fullName).join(', ')} ${keep.length === 1 ? 'steht' : 'stehen'} nicht mehr in der Liste, ${keep.length === 1 ? 'hat' : 'haben'} aber schon Fragebogen oder Gespräch – ${keep.length === 1 ? 'bleibt' : 'bleiben'} deshalb in der Liste. Weiter?`)) return;
    R.push(...keep.map(r => ({ v: r.v, n: r.n, t: r.t })));
    try {
      const r = await withBusy('verschlüsselt …', async () => api('c_save', { id: c?.id, klasse, titel: $('#ti', d.el).value.trim(), vorlage: $('#vo', d.el).value, gbogen: $('#gb', d.el).value,
        roster_enc: await K.seal(S.keys.pub_key, R), roster_n: R.length, tids: await Promise.all(R.map(x => tidOf(x.t))) }));
      d.close(); toast('✓ gespeichert'); if (location.hash === '#/c/' + r.coaching.id) viewCoaching(H, r.coaching.id); else location.hash = '#/c/' + r.coaching.id;
    } catch (e) { $('#err', d.el).textContent = e.message; }
  };
}

/* ---------- Ein Coaching: Klassen-Dashboard ---------- */
export async function viewCoaching(H, id) {
  const { S, api, main, esc, toast } = H;
  main.innerHTML = tabsHtml('c', S) + '<p class="help">entschlüsselt …</p>';
  let D; try { D = await load(H, id); } catch (e) { main.innerHTML = tabsHtml('c', S) + `<p class="err">${esc(e.message)}</p>`; return; }
  const { c, rTpl, gTpl } = D, P = people(D);
  const subs = P.filter(x => x.sub), done = P.filter(x => x.note?.done), wieder = P.filter(x => x.note?.data?.wieder).sort((a, b) => a.note.data.wieder.localeCompare(b.note.data.wieder));
  const row = (x, i) => `<tr class="click" data-p="${i}"><td><b>${esc(fullName(x))}</b>${x.unknown ? ' <span class="chip warn" title="Nicht in der Klassenliste">?</span>' : ''}</td>
    <td>${x.sub ? `<span class="chip good">✓ ${esc(deDate(new Date(x.sub.at)))}</span>` : '<span class="help">–</span>'}</td>
    <td>${x.sub?.answers?.wohl ? `<b>${x.sub.answers.wohl}</b>/10` : '<span class="help">–</span>'}</td>
    <td>${x.note?.done ? `<span class="chip good">💬 ${esc(deDate(x.note.datum))}</span>` : x.note ? '<span class="chip warn">begonnen</span>' : '<span class="help">offen</span>'}</td>
    <td>${x.note?.data?.wieder ? esc(deDate(x.note.data.wieder)) : ''}</td>
    <td>${x.note?.data?.weitergabe ? (x.note.data.weitergabe.startsWith('Ja') ? '<span class="chip good">Ja</span>' : '<span class="chip">Nein</span>') : ''}</td></tr>`;
  main.innerHTML = `${tabsHtml('c', S)}<p><a href="#/coaching">‹ Alle Coachings</a></p>
    <h1>Klasse ${esc(c.klasse)} · ${esc(c.titel || 'Lerncoaching')}</h1>
    <p class="sub">${esc(rTpl?.label)} · ${esc(gTpl?.label)} · Schuljahr ${esc(c.schuljahr)} <span class="c-lock">🔒 nur für dich lesbar</span></p>
    <div class="bar"><button class="btn pri" id="qr">QR-Codes (PDF)</button><label class="ck"><input type="checkbox" id="op"${c.open ? ' checked' : ''}> Fragebogen offen</label>
      <span class="sp"></span><button class="btn" id="pr">🖨 Drucken</button><button class="btn" id="ex">⇩ Export</button><button class="btn" id="ub">↪ Übergabe</button><button class="btn" id="sb">📊 An Schulberatung</button><button class="btn ghost" id="ed">Bearbeiten</button><button class="btn ghost danger" id="del">🗑</button></div>
    ${S.user.is_demo && P.some(x => !x.sub && x.t) ? `<div class="c-hint"><b>Demo – so probierst du den ganzen Ablauf aus:</b><ol style="margin:6px 0 0">
      <li>Tippe auf <b>${esc(fullName(P.find(x => !x.sub && x.t)))}</b> → <b>QR-Code anzeigen</b> und scanne ihn mit einem zweiten Gerät (Handy oder iPad).</li>
      <li>Fülle dort die Selbstreflexion aus und schicke sie ab.</li><li>Hier <b>neu laden</b>, auf den Namen tippen → <b>Coachinggespräch starten</b>, Notizen machen, „Gespräch geführt“ ankreuzen.</li>
      <li><b>📊 An Schulberatung</b> einreichen und im Tab <b>Schulberatung</b> ansehen, was dort ankommt.</li></ol></div>` : ''}
    <div class="c-grid">
      <div class="card" style="grid-column:1/-1"><h2 style="margin-top:0">Schüler:innen <span class="help">${subs.length}/${D.R.length} Fragebögen · ${done.length}/${D.R.length} Gespräche</span></h2>
        <div style="overflow:auto"><table class="c-table"><tr><th>Name</th><th>Fragebogen</th><th>Wohlbefinden</th><th>Gespräch</th><th>Wiedervorlage</th><th>Weitergabe</th></tr>${P.map(row).join('')}</table></div>
        <p class="help">Tippe auf einen Namen: Fragebogen ansehen, QR-Code zeigen und Coachinggespräch starten.</p>
        <div class="bar" style="margin:10px 0 0"><input type="text" id="av" placeholder="Vorname" style="width:150px" autocomplete="off"><input type="text" id="an" placeholder="Nachname" style="width:170px" autocomplete="off"><button class="btn" id="add">＋ Schüler:in ergänzen</button><span class="sp"></span><button class="btn" id="csv">⤒ Klassenliste einlesen</button></div></div>
      <div class="card"><h2 style="margin-top:0">Klasse auf einen Blick <span class="help">aus ${subs.length} Fragebögen</span></h2>${statsHtml(rTpl, stats(rTpl, subs.map(x => x.sub.answers)))}</div>
      <div class="card"><h2 style="margin-top:0">Aus den Gesprächen <span class="help">${done.length} geführt</span></h2>${statsHtml(gTpl, stats(gTpl, P.filter(x => x.note).map(x => x.note.data || {})))}
        ${wieder.length ? `<h3>Wiedervorlagen</h3>${wieder.map(x => `<div class="st-b" style="grid-template-columns:110px 1fr"><b>${esc(deDate(x.note.data.wieder))}</b><span>${esc(fullName(x))}</span></div>`).join('')}` : ''}</div>
    </div>`;
  main.onclick = e => { const tr = e.target.closest('[data-p]'); if (tr) studentDialog(H, D, P[+tr.dataset.p]); };
  $('#qr').onclick = () => showPdf(qrPdf(c, D.R, S.user.name || S.user.kuerzel), `QR-Codes_Coaching_${safe(c.klasse)}.pdf`);
  $('#op').onchange = async e => { await api('c_open', { id: c.id, open: e.target.checked }); toast(e.target.checked ? 'Fragebogen ist offen' : 'Fragebogen geschlossen – neue Abgaben werden abgelehnt'); };
  $('#pr').onclick = () => printPeople(H, D, P.filter(x => x.sub || x.note));
  $('#ex').onclick = () => exportDialog(H, [c.id]);
  $('#ub').onclick = () => handoverDialog(H, D);
  $('#sb').onclick = () => reportDialog(H, D);
  $('#ed').onclick = () => coachingForm(H, D);
  const addOne = async () => {
    const v = $('#av').value.trim(), n = $('#an').value.trim();
    if (!v && !n) { $('#av').focus(); return; }
    if (D.R.some(r => `${r.v}|${r.n}`.toLowerCase() === `${v}|${n}`.toLowerCase())) { toast(`⚠ ${esc(v)} ${esc(n)} steht schon in der Liste`); return; }
    await saveRoster(H, D, [...D.R, { v, n, t: newToken() }].sort((a, b) => a.n.localeCompare(b.n, 'de') || a.v.localeCompare(b.v, 'de')));
    toast(`✓ ${esc(v)} ${esc(n)} ergänzt – QR-Code: auf den Namen tippen`, 5000); viewCoaching(H, c.id);
  };
  $('#add').onclick = addOne; $('#an').onkeydown = e => { if (e.key === 'Enter') addOne(); }; $('#av').onkeydown = e => { if (e.key === 'Enter') $('#an').focus(); };
  $('#csv').onclick = () => H.pickFile('.csv,.txt,text/csv,text/plain', async f => { if (await importRoster(H, D, H.parseNames(await f.text()))) viewCoaching(H, c.id); });
  $('#del').onclick = async () => {
    if (!confirm(`Coaching ${c.klasse} „${c.titel}“ löschen?`)) return;
    if (!confirm(`Bist du sicher? Alle Fragebögen und Gesprächsnotizen werden endgültig gelöscht.${c.exported ? '' : '\n\nDu hast dieses Coaching noch nicht exportiert.'}`)) return;
    await api('c_delete', { id: c.id }); toast('🗑 gelöscht'); location.hash = '#/coaching';
  };
}

/** Klassenliste speichern (verschlüsselt); persönliche Schlüssel bleiben erhalten */
async function saveRoster(H, D, R) {
  const { S, api, K, withBusy } = H, c = D.c;
  await withBusy('Klassenliste wird verschlüsselt …', async () => api('c_save', { id: c.id, klasse: c.klasse, titel: c.titel, vorlage: c.vorlage, gbogen: c.gbogen,
    roster_enc: await K.seal(S.keys.pub_key, R.map(r => ({ v: r.v, n: r.n, t: r.t }))), roster_n: R.length, tids: await Promise.all(R.map(x => tidOf(x.t))) }));
}
/** Klassenliste aus der Schulverwaltung: gleiche Namen behalten ihren QR-Code; wer schon Fragebogen oder Notizen hat, bleibt immer */
async function importRoster(H, D, L) {
  const { toast } = H;
  if (!L.length) { toast('⚠ In der Datei wurden keine Namen erkannt'); return false; }
  const key = r => `${r.v}|${r.n}`.toLowerCase(), old = new Map(D.R.map(r => [key(r), r])), neu = new Set(L.map(key));
  const keep = D.R.filter(r => !neu.has(key(r)) && (r.sub || r.note)), drop = D.R.filter(r => !neu.has(key(r)) && !r.sub && !r.note);
  const add = L.filter(r => !old.has(key(r)));
  if (!confirm(`Klassenliste einlesen: ${L.length} Namen.\n\n${add.length} neu${drop.length ? `, ${drop.length} entfallen (${drop.map(fullName).join(', ')})` : ''}${keep.length ? `\n${keep.length} bleiben, obwohl nicht in der Datei, weil schon Fragebogen oder Gespräch vorliegen (${keep.map(fullName).join(', ')})` : ''}.\n\nGedruckte QR-Codes bleiben für gleiche Namen gültig. Übernehmen?`)) return false;
  const R = [...L.map(r => old.get(key(r)) || { v: r.v, n: r.n, t: newToken() }), ...keep].sort((a, b) => a.n.localeCompare(b.n, 'de') || a.v.localeCompare(b.v, 'de'));
  await saveRoster(H, D, R); toast(`✓ Klassenliste übernommen${add.length ? ` – ${add.length} neu, QR-Codes über „QR-Codes (PDF)“ oder den Namen` : ''}`, 5000); return true;
}

function studentDialog(H, D, x) {
  const { dialog, esc, toast } = H, { c, rTpl } = D;
  const d = dialog(esc(fullName(x)), `
    <div class="btns" style="margin-bottom:12px"><button class="btn pri" data-talk>💬 Coachinggespräch ${x.note ? 'fortsetzen' : 'starten'}</button><button class="btn" data-print>🖨 Drucken</button>${x.t ? '<button class="btn" data-qr>▦ QR-Code anzeigen</button><button class="btn" data-qrpdf>QR-Blatt (PDF)</button><button class="btn ghost sm" data-link title="Für ein Kind, das sein Blatt nicht hat">Persönlichen Link kopieren</button>' : ''}</div>
    ${x.sub ? `<p class="help">Fragebogen abgegeben am ${esc(new Date(x.sub.at).toLocaleString('de-DE'))}${x.sub.n > 1 ? ` (${x.sub.n}× gesendet, der neueste zählt)` : ''}</p>${viewHtml(rTpl, x.sub.answers)}` : '<p class="help">Noch kein Fragebogen abgegeben.</p>'}`, { wide: true });
  d.el.onclick = async e => {
    if (e.target.closest('[data-talk]')) { d.close(); talk(H, D, x); }
    if (e.target.closest('[data-print]')) printPeople(H, D, [x]);
    if (e.target.closest('[data-qr]')) dialog(`QR-Code für ${esc(fullName(x))}`, `<div style="text-align:center"><div class="qrbox" style="width:min(340px,80vw);margin:0 auto">${qrSvg(personalLink(c.code, x), { title: 'Persönlicher QR-Code' })}</div><p><b>${esc(fullName(x))}</b> · Klasse ${esc(c.klasse)}</p><p class="help">Nur diesem Kind zeigen – der Code öffnet seinen persönlichen Fragebogen.</p></div>`);
    if (e.target.closest('[data-qrpdf]')) showPdf(qrPdf(c, [x], H.S.user.name || H.S.user.kuerzel), `QR-Code_${safe(fullName(x))}.pdf`);
    if (e.target.closest('[data-link]')) { try { await navigator.clipboard.writeText(personalLink(c.code, x)); toast('📋 Link kopiert – nur an dieses Kind geben'); } catch (er) { prompt('Persönlicher Link:', personalLink(c.code, x)); } }
  };
}

/* ---------- Coachinggespräch: links Notizen (Gesprächsbogen), rechts der Fragebogen ---------- */
function talk(H, D, x) {
  const { S, api, K, esc, toast } = H, { c, rTpl, gTpl } = D;
  const note = x.note || { v: 1, gbogen: gTpl.id, datum: today(), done: false, data: { ...(x.sub?.answers?.wohl ? { wohl: x.sub.answers.wohl } : {}) } };
  const el = document.createElement('div'); el.className = 'c-talk';
  el.innerHTML = `<header><b>💬 ${esc(fullName(x))}</b><span class="help">Klasse ${esc(c.klasse)}</span>
      <label class="ck">Datum <input type="date" id="tdat" value="${esc(note.datum || today())}" style="width:auto"></label>
      <label class="ck"><input type="checkbox" id="tdone"${note.done ? ' checked' : ''}> Gespräch geführt</label><span class="sp"></span>
      <span class="c-save" id="tsv">🔒 wird verschlüsselt gespeichert</span><button class="btn sm" id="tpr">🖨</button><button class="btn sm pri" id="tok">Fertig</button></header>
    <div class="panes"><div class="pane"><h2>Gesprächsnotizen</h2><p class="help">${esc(gTpl.label)} – speichert automatisch.</p><form class="cform" id="tf" autocomplete="off">${formHtml(gTpl, note.data, 'g_')}</form></div>
      <div class="pane right"><h2>Selbstreflexion von ${esc(x.v || x.n)}</h2>${x.sub ? `<p class="help">abgegeben am ${esc(deDate(new Date(x.sub.at)))}</p>${viewHtml(rTpl, x.sub.answers)}` : '<p class="help">Kein Fragebogen abgegeben.</p>'}</div></div>`;
  document.body.append(el); document.body.style.overflow = 'hidden';
  let timer = null, saving = null, dirty = false;
  const collect = () => { note.data = readForm($('#tf', el), gTpl, 'g_'); note.datum = $('#tdat', el).value || today(); note.done = $('#tdone', el).checked; note.updated = Date.now(); };
  const save = async () => {
    clearTimeout(timer); timer = null; if (!dirty) return saving; dirty = false; collect();
    $('#tsv', el).textContent = 'speichert …';
    saving = (async () => {
      try { await api('c_note', { id: c.id, tid: x.tid, note_enc: await K.seal(S.keys.pub_key, note), done: note.done }); x.note = { ...note }; $('#tsv', el).textContent = `🔒 gespeichert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`; }
      catch (e) { dirty = true; $('#tsv', el).innerHTML = `<span class="err">⚠ nicht gespeichert: ${esc(e.message)}</span>`; }
    })();
    return saving;
  };
  const later = () => { dirty = true; $('#tsv', el).textContent = '…'; clearTimeout(timer); timer = setTimeout(save, 1200); };
  el.addEventListener('input', later); el.addEventListener('change', later);
  if (!x.note) { dirty = true; save(); } // Gespräch begonnen
  $('#tpr', el).onclick = async () => { await save(); printPeople(H, D, [x]); };
  $('#tok', el).onclick = async () => {
    await save(); if (dirty) { if (!confirm('Die letzten Änderungen sind nicht gespeichert. Trotzdem schließen?')) return; }
    el.remove(); document.body.style.overflow = ''; viewCoaching(H, c.id);
  };
}

/* ---------- Drucken (für den Schul-Safe) ---------- */
function printPeople(H, D, list) {
  const { S, toast } = H, { c, rTpl, gTpl } = D;
  if (!list.length) { toast('Noch nichts zum Drucken – es gibt weder Fragebögen noch Gesprächsnotizen.'); return; }
  let pr = $('#cprint'); if (!pr) { pr = document.createElement('div'); pr.id = 'cprint'; document.body.append(pr); }
  const coach = S.user.name || S.user.kuerzel;
  pr.innerHTML = list.map(x => (x.sub ? printHtml(rTpl, x.sub.answers, { name: fullName(x), klasse: c.klasse, datum: deDate(new Date(x.sub.at)) }) : '')
    + (x.note ? printHtml(gTpl, x.note.data || {}, { name: fullName(x), klasse: c.klasse, datum: deDate(x.note.datum), coach }) : '')).join('');
  document.body.classList.add('c-printing');
  const end = () => { document.body.classList.remove('c-printing'); pr.innerHTML = ''; removeEventListener('afterprint', end); };
  addEventListener('afterprint', end);
  setTimeout(() => { window.print(); setTimeout(() => { if (!matchMedia('print').matches) end(); }, 1500); }, 50);
}

/* ---------- QR-Codes (A4 je Schüler:in) ---------- */
function qrPdf(c, R, coach) {
  const pdf = new Pdf(`QR-Codes Coaching ${c.klasse}`), MM = 72 / 25.4, M = 20 * MM, Q = 80 * MM;
  R.forEach((r, i) => {
    if (i) pdf.addPage();
    let y = M + 22;
    pdf.text(fit(fullName(r), 24, true, PAGE_W - 2 * M), M, y, 24, { bold: true }); y += 24;
    pdf.text(fit(`${c.titel || 'Lerncoaching'} · Klasse ${c.klasse} · bei ${coach}`, 12.5, false, PAGE_W - 2 * M), M, y, 12.5, { col: '#333333' }); y += 34;
    const lines = ['Vor deinem Coachinggespräch füllst du eine kurze Selbstreflexion aus.', 'Scanne dazu diesen QR-Code mit deinem iPad.', 'Deine Antworten werden verschlüsselt – nur deine Klassenleitung kann sie lesen.', 'Du musst nicht alles beantworten.'];
    for (const l of lines) { pdf.text(l, M, y, 12); y += 18; }
    const QM = qrMatrix(personalLink(c.code, r)), cs = Q / QM.length, qx = (PAGE_W - Q) / 2, qy = y + 20;
    pdf.color('#000000');
    QM.forEach((row, yy) => { let s0 = -1; for (let xx = 0; xx <= row.length; xx++) { const on = xx < row.length && row[xx]; if (on && s0 < 0) s0 = xx; if (!on && s0 >= 0) { pdf.ops.push(`${(qx + s0 * cs).toFixed(2)} ${(PAGE_H - qy - (yy + 1) * cs).toFixed(2)} ${((xx - s0) * cs).toFixed(2)} ${cs.toFixed(2)} re f`); s0 = -1; } } });
    y = qy + Q + 26;
    pdf.text('Dieser QR-Code gehört nur dir. Gib ihn nicht weiter.', PAGE_W / 2, y, 12, { bold: true, align: 'center' });
    pdf.text(`${fullName(r)} · ${c.klasse}`, PAGE_W / 2, PAGE_H - M / 2, 7, { col: '#a0a4ad', align: 'center' });
  });
  return pdf.bytes();
}

/* ---------- Export (eigenes Archiv, Jahresende) ---------- */
async function exportDialog(H, ids) {
  const { S, api, K, dialog, esc, toast, withBusy } = H;
  const d = dialog('⇩ Coaching verschlüsselt exportieren', `<p>Die Datei enthält Klassenliste, Fragebögen und Gesprächsnotizen – verschlüsselt (AES-256-GCM). Öffnen kann sie nur, wer die <b>Passphrase</b> kennt, oder du selbst mit deinem Probe-Konto (📂 Datei öffnen).</p>
    ${H.field('Passphrase (mindestens 12 Zeichen)', '<input type="password" id="pp1" autocomplete="new-password">')}${H.field('Passphrase wiederholen', '<input type="password" id="pp2" autocomplete="new-password">', 'Notiere sie getrennt von der Datei, z. B. im Schul-Safe. Ohne sie lässt sich die Datei nach dem Löschen deines Kontos nicht mehr öffnen.')}
    <div class="err" id="err"></div><button class="btn pri" id="go">Exportieren</button>`);
  $('#go', d.el).onclick = async () => {
    const p1 = $('#pp1', d.el).value, p2 = $('#pp2', d.el).value;
    if (p1.length < 12) { $('#err', d.el).textContent = 'Die Passphrase braucht mindestens 12 Zeichen.'; return; }
    if (p1 !== p2) { $('#err', d.el).textContent = 'Die beiden Eingaben sind verschieden.'; return; }
    try {
      const file = await withBusy('verschlüsselt …', async () => {
        const items = [];
        for (const id of ids) { const D = await load(H, id); items.push({ meta: D.c, people: people(D).map(x => ({ v: x.v, n: x.n, sub: x.sub || null, note: x.note || null })) }); }
        const A = await K.archiveSeal({ probe: 'coaching', v: 1, exported: Date.now(), von: S.user.name || S.user.kuerzel, items },
          { users: [{ role: 'lehrkraft', kuerzel: S.user.kuerzel, name: S.user.name, pub_key: S.keys.pub_key }], passphrase: p1, info: { art: 'coaching', klassen: items.map(i => i.meta.klasse) } });
        return { A, items };
      });
      const name = `Coaching_${safe(file.items.map(i => i.meta.klasse).join('-'))}_${safe(file.items[0]?.meta.schuljahr || '')}.probe-coaching.json`;
      download(name, JSON.stringify(file.A)); await api('c_exported', { ids }); d.close(); toast(`⇩ ${esc(name)} gespeichert`, 5000);
    } catch (e) { $('#err', d.el).textContent = e.message; }
  };
}

/* ---------- Übergabe an die nächste Klassleitung: nur mit „Ja“, nur weitergebbare Felder ---------- */
async function handoverDialog(H, D) {
  const { S, api, K, dialog, esc, toast, withBusy } = H, { c, gTpl } = D;
  const ok = people(D).filter(x => x.note?.data?.weitergabe?.startsWith('Ja'));
  const fields = questions(gTpl).filter(q => q.w);
  let users = []; try { users = (await api('c_colleagues')).users; } catch (e) { }
  const d = dialog('↪ Übergabe an die nächste Klassleitung', `<p>Mit Einwilligung (<b>${ok.length}</b> von ${people(D).length} Schüler:innen): nur <b>${fields.map(q => esc(q.q.replace(/:$/, ''))).join(', ')}</b> – keine persönlichen Gesprächsnotizen, kein Fragebogen.</p>
    ${ok.length ? `${H.field('Für die Kollegin / den Kollegen', `<select id="to"><option value="">– nur mit Passphrase –</option>${users.map(u => `<option value="${u.id}">${esc(u.kuerzel)}${u.name ? ' · ' + esc(u.name) : ''}</option>`).join('')}</select>`, 'Die Datei wird für das Probe-Konto dieser Person verschlüsselt – niemand sonst kann sie öffnen.')}
    ${H.field('Zusätzlich mit Passphrase (optional, mind. 12 Zeichen)', '<input type="password" id="pp" autocomplete="new-password">', 'Falls die neue Klassleitung (noch) kein Probe-Konto hat.')}
    <div class="err" id="err"></div><button class="btn pri" id="go">Übergabe-Datei erstellen</button>` : '<p class="help">Noch niemand hat der Weitergabe zugestimmt (Gesprächsbogen → Einwilligung „Ja“).</p>'}`);
  if (!ok.length) return;
  $('#go', d.el).onclick = async () => {
    const u = users.find(x => String(x.id) === $('#to', d.el).value), pp = $('#pp', d.el).value;
    if (!u && pp.length < 12) { $('#err', d.el).textContent = 'Wähle eine Person oder gib eine Passphrase (mind. 12 Zeichen) ein.'; return; }
    if (pp && pp.length < 12) { $('#err', d.el).textContent = 'Die Passphrase braucht mindestens 12 Zeichen.'; return; }
    const entries = ok.map(x => ({ v: x.v, n: x.n, datum: x.note.datum, felder: fields.filter(q => x.note.data[q.id] !== undefined).map(q => ({ q: q.q, t: q.t, v: x.note.data[q.id] })) }));
    const A = await withBusy('verschlüsselt …', () => K.archiveSeal({ probe: 'coaching-uebergabe', v: 1, klasse: c.klasse, schuljahr: c.schuljahr, von: S.user.name || S.user.kuerzel, created: Date.now(), entries },
      { users: u ? [{ role: 'klassleitung', kuerzel: u.kuerzel, name: u.name, pub_key: u.pub_key }] : [], passphrase: pp, info: { art: 'coaching-uebergabe', klasse: c.klasse } }));
    download(`Uebergabe_Coaching_${safe(c.klasse)}_${safe(c.schuljahr)}.probe-coaching.json`, JSON.stringify(A)); d.close(); toast('↪ Übergabe-Datei erstellt – gib sie der neuen Klassleitung (z. B. per AirDrop).', 6000);
  };
}

/* ---------- Datei öffnen (eigener Export oder Übergabe) ---------- */
function openFile(H) {
  const { S, K, dialog, esc, pickFile, toast } = H;
  pickFile('.json,application/json', async f => {
    let A; try { A = JSON.parse(await f.text()); } catch (e) { toast('⚠ Keine gültige Datei'); return; }
    let data = null;
    try { data = await K.archiveOpen(A, { priv: S.priv, pub: S.keys.pub_key }); } catch (e) { toast('⚠ ' + esc(e.message)); return; }
    if (!data) {
      const pp = prompt('Diese Datei ist nicht für dein Konto verschlüsselt. Passphrase:'); if (!pp) return;
      try { data = await K.archiveOpen(A, { passphrase: pp }); } catch (e) { }
      if (!data) { toast('⚠ Passphrase falsch oder Datei beschädigt', 5000); return; }
    }
    if (data.probe === 'coaching-uebergabe') {
      dialog(`↪ Übergabe Klasse ${esc(data.klasse)}`, `<p class="help">von ${esc(data.von)} · Schuljahr ${esc(data.schuljahr)} · nur mit Einwilligung weitergegebene Ziele, Hilfen und Ergebnisse</p>
        ${data.entries.map(e => `<div class="card" style="margin:0 0 10px"><h3 style="margin:0 0 6px">${esc(fullName(e))}</h3><p class="help">Gespräch vom ${esc(deDate(e.datum))}</p>${e.felder.map(f => `<div class="cv-q"><div class="cv-l">${esc(f.q)}</div>${Array.isArray(f.v) ? f.v.map(v => `<span class="cv-chip">${esc(v)}</span>`).join(' ') : `<div class="cv-text">${esc(f.v)}</div>`}</div>`).join('')}</div>`).join('')}`, { wide: true });
      return;
    }
    if (data.probe !== 'coaching') { toast('⚠ Das ist keine Coaching-Datei'); return; }
    const d = dialog('📂 Coaching-Export', data.items.map((it, i) => `<h3>Klasse ${esc(it.meta.klasse)} · ${esc(it.meta.titel)} <span class="help">${esc(it.meta.schuljahr)}</span> <button class="btn sm" data-pi="${i}">🖨 Drucken</button></h3>
      <table class="c-table">${it.people.map(p => `<tr><td>${esc(fullName(p))}</td><td>${p.sub ? '📝 Fragebogen' : ''}</td><td>${p.note ? `💬 ${esc(deDate(p.note.datum))}` : ''}</td></tr>`).join('')}</table>`).join(''), { wide: true });
    d.el.onclick = e => { const b = e.target.closest('[data-pi]'); if (!b) return; const it = data.items[+b.dataset.pi]; printPeople(H, { c: it.meta, rTpl: VORLAGEN[it.meta.vorlage], gTpl: VORLAGEN[it.meta.gbogen] }, it.people.filter(p => p.sub || p.note)); };
  });
}

/* ---------- Anonymisierte Zahlen an die Schulberatung ---------- */
function reportData(D) {
  const { c, rTpl, gTpl } = D, P = people(D);
  return { v: 1, klasse: c.klasse, schuljahr: c.schuljahr, vorlage: c.vorlage, gbogen: c.gbogen, n: D.R.length,
    n_subs: P.filter(x => x.sub).length, n_done: P.filter(x => x.note?.done).length,
    refl: anon(stats(rTpl, P.filter(x => x.sub).map(x => x.sub.answers))), gespr: anon(stats(gTpl, P.filter(x => x.note?.done).map(x => x.note.data || {}))) };
}
async function reportDialog(H, D) {
  const { api, K, dialog, esc, toast, withBusy } = H, { c, rTpl, gTpl } = D;
  let B = []; try { B = (await api('c_berater')).users; } catch (e) { }
  const R = reportData(D);
  const d = dialog('📊 Anonymisierte Auswertung an die Schulberatung', `<p>Es gehen <b>nur Zahlen</b> zur Klasse ${esc(c.klasse)}: Verteilungen der Ankreuz-Fragen und Mittelwerte. <b>Keine Namen, keine Freitexte, keine Notizen.</b> Häufigkeiten von 1 oder 2 erscheinen nur als „1–2“, Mittelwerte erst ab 3 Antworten.</p>
    <p>Empfänger: ${B.length ? B.map(u => `<b>${esc(u.name || u.kuerzel)}</b>`).join(', ') + ' (für sie verschlüsselt)' : '<span class="err">Es ist noch keine Schulberatung eingerichtet (Admin → Lehrkraft → Schulberatung).</span>'}</p>
    ${c.reported ? `<p class="help">Schon eingereicht am ${esc(deDate(new Date(c.reported * 1000)))} – erneutes Einreichen ersetzt die Zahlen.</p>` : ''}
    <details><summary>Vorschau: genau das sieht die Schulberatung</summary><div class="c-grid" style="margin-top:10px"><div><h4>Selbstreflexion (${R.n_subs} von ${R.n})</h4>${statsHtml(rTpl, R.refl)}</div><div><h4>Gespräche (${R.n_done})</h4>${statsHtml(gTpl, R.gespr)}</div></div></details>
    <div class="err" id="err"></div><button class="btn pri" id="go"${B.length ? '' : ' disabled'}>Einreichen</button>`, { wide: true });
  $('#go', d.el).onclick = async () => {
    try {
      const enc = {}; await withBusy('verschlüsselt …', async () => { for (const u of B) enc[u.id] = await K.seal(u.pub_key, R); await api('c_report', { id: c.id, enc }); });
      d.close(); toast('📊 an die Schulberatung übermittelt'); viewCoaching(H, c.id);
    } catch (e) { $('#err', d.el).textContent = e.message; }
  };
}

/* ---------- Schulberatung: Zahlen nach Jahrgangsstufen ---------- */
export async function viewBerater(H) {
  const { S, api, K, main, esc } = H;
  main.innerHTML = tabsHtml('b', S) + '<p class="help">entschlüsselt …</p>';
  let L; try { L = (await api('c_reports')).reports; } catch (e) { main.innerHTML = tabsHtml('b', S) + `<p class="err">${esc(e.message)}</p>`; return; }
  const all = []; for (const r of L) { try { all.push({ ...r, d: await K.open(S.priv, r.enc) }); } catch (e) { } }
  const sjs = [...new Set(all.map(r => r.schuljahr))].sort().reverse(); let sj = H.S.bsj && sjs.includes(H.S.bsj) ? H.S.bsj : sjs[0];
  const draw = () => {
    const R = all.filter(r => r.schuljahr === sj), jg = [...new Set(R.map(r => r.jgst))].sort((a, b) => a - b);
    main.innerHTML = `${tabsHtml('b', S)}<h1>Schulberatung: Lerncoaching</h1><p class="sub">Anonymisierte Zahlen der Klassleitungen – keine Namen, keine Freitexte. „1–2“ = kleine Gruppen, nicht genauer angegeben.</p>
      ${sjs.length ? `<div class="bar"><select id="bsj" style="width:auto">${sjs.map(s => `<option${s === sj ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select><span class="help">${R.length} Klassen eingereicht</span></div>` : '<div class="empty"><h2>Noch keine Auswertungen</h2><p>Sobald Klassleitungen ihre Coaching-Zahlen einreichen, erscheinen sie hier nach Jahrgangsstufen.</p></div>'}
      ${jg.map(j => {
        const G = R.filter(r => r.jgst === j), vs = [...new Set(G.map(r => r.d.vorlage))], gs = [...new Set(G.map(r => r.d.gbogen))];
        const sum = k => G.reduce((s, r) => s + (r.d[k] || 0), 0);
        return `<div class="klasse"><h2>Jahrgangsstufe ${j || '?'}</h2><span class="help">${G.map(r => esc(r.klasse)).join(', ')} · ${sum('n_subs')} Fragebögen · ${sum('n_done')} Gespräche bei ${sum('n')} Schüler:innen</span></div>
          <div class="c-grid">${vs.map(v => `<div class="card"><h3 style="margin-top:0">${esc(VORLAGEN[v]?.label || v)}</h3>${statsHtml(VORLAGEN[v], addStats(G.filter(r => r.d.vorlage === v).map(r => r.d.refl)))}</div>`).join('')}
          ${gs.map(g => `<div class="card"><h3 style="margin-top:0">Gespräche · ${esc(VORLAGEN[g]?.label || g)}</h3>${statsHtml(VORLAGEN[g], addStats(G.filter(r => r.d.gbogen === g).map(r => r.d.gespr)))}</div>`).join('')}</div>`;
      }).join('')}
      ${R.length ? `<h2>Eingereicht</h2><table class="c-table"><tr><th>Klasse</th><th>Klassleitung</th><th>Fragebögen</th><th>Gespräche</th><th>am</th></tr>${R.map(r => `<tr><td>${esc(r.klasse)}</td><td>${esc(r.lehrkraft)}</td><td>${r.d.n_subs}/${r.d.n}</td><td>${r.d.n_done}</td><td>${esc(deDate(new Date(r.created * 1000)))}</td></tr>`).join('')}</table>` : ''}`;
    $('#bsj') && ($('#bsj').onchange = e => { sj = H.S.bsj = e.target.value; draw(); });
  };
  draw();
}

/* ---------- Admin: Coaching-Daten aller Lehrkräfte löschen ---------- */
export async function purgeAll(H, alsoReports) {
  for (let i = 1; i <= 3; i++) if (!confirm(`${i}/3 · Bist du dir wirklich sicher?!!!\n\nAlle Coaching-Daten ALLER Lehrkräfte werden endgültig gelöscht: Klassenlisten, Fragebögen der Schüler:innen und Gesprächsnotizen${alsoReports ? ' – und die anonymisierten Auswertungen der Schulberatung' : ''}. Das lässt sich nicht rückgängig machen.`)) return null;
  return H.api('c_purge_all', { confirm: 'COACHING LÖSCHEN', reports: !!alsoReports });
}

/* ---------- Beispiel / Demo: Klasse 7z mit 8 erfundenen Schüler:innen ----------
   7 haben ihre Selbstreflexion abgegeben und das Gespräch ist geführt; Mia Sommer ist noch offen – für den Scan mit einem
   Zweitgerät, danach Gespräch führen und die Zahlen bei der Schulberatung einreichen. */
const DEMO = [
  { v: 'Ada', n: 'Brenner', a: { wohl: 8, klasse: 'wohl / zugehörig', gut_belastet: 'Meine Freundinnen in der Klasse tun mir gut. Manchmal stressen mich die vielen Hausaufgaben.', zuversicht: 'meistens', schwer: ['Lernplanung', 'Prüfungsdruck'], faecher: 'Mathe', gut: 'Englisch und Vokabeln', thema: 'Wie ich mir vor Schulaufgaben die Zeit besser einteile.', wunsch: ['Tipps zum Lernen'], schritt: 'Einen Lernplan für die nächste Schulaufgabe schreiben' },
    g: { wohl: 8, staerke: 'sehr gewissenhaft', thema: ['Planen'], schwierig: 'Lernt erst am Vortag, dann wird es zu viel.', hilfen: ['Lernplan / Lernslots'], vereinbarung: 'Vor jeder Schulaufgabe einen Lernplan mit 4 kurzen Lernslots.', wann: 'ab der Mathe-Schulaufgabe, Rückblick danach', weitergabe: 'Ja, das ist okay.' } },
  { v: 'Ben', n: 'Crusius', a: { wohl: 5, klasse: 'teils / teils', gut_belastet: 'Fußball nach der Schule. In den Pausen stehe ich oft allein.', zuversicht: 'manchmal', schwer: ['Motivation / Anfangen', 'Konzentration'], faecher: 'Deutsch, Latein', gut: 'Sport, Bio', thema: 'Ich fange mit Hausaufgaben immer zu spät an.', wunsch: ['Tipps zum Lernen', 'Einfach reden'], schritt: 'Hausaufgaben direkt nach dem Essen anfangen' },
    g: { wohl: 5, staerke: 'hilfsbereit im Sport', thema: ['Wohlbefinden / Miteinander', 'Planen'], schwierig: 'Anfangen fällt schwer, Handy lenkt ab.', hilfen: ['Lernplan / Lernslots', 'Vertrauensperson / weitere Beratung'], vereinbarung: 'Handy während der Hausaufgaben in die Küche. Gespräch mit der Beratungslehrkraft über die Pausensituation.', wann: 'täglich, Rückblick in 3 Wochen', weitergabe: 'Ja, das ist okay.' } },
  { v: 'Clara', n: 'Demir', a: { wohl: 9, klasse: 'wohl / zugehörig', gut_belastet: 'Die Theater-AG.', zuversicht: 'meistens', schwer: ['Üben / Behalten'], faecher: 'Französisch', gut: 'Deutsch, Referate', thema: 'Französisch-Vokabeln bleiben nicht hängen.', wunsch: ['Hilfe in einem Fach'], schritt: 'Jeden Tag 10 Minuten Vokabeln mit Karteikarten' },
    g: { wohl: 9, staerke: 'präsentiert sehr sicher', thema: ['Üben'], schwierig: 'Vokabeln nur einmal am Abend vor dem Test gelernt.', hilfen: ['Wiederholen / Selbstabfrage', 'Fachlehrkraft / Lernpartner'], vereinbarung: 'Karteikasten mit 3 Fächern, Lernpartnerin für die Abfrage.', wann: 'täglich 10 Minuten, Rückblick nach dem nächsten Test', weitergabe: 'Ja, das ist okay.' } },
  { v: 'David', n: 'Engel', a: { wohl: 6, klasse: 'teils / teils', gut_belastet: 'Mein Hund. Belastet: Streit mit meinem Bruder.', zuversicht: 'manchmal', schwer: ['Lernstoff verstehen'], faecher: 'Mathe, Physik', gut: 'Geschichte', thema: 'In Mathe verstehe ich die Textaufgaben nicht.', wunsch: ['Hilfe in einem Fach'], schritt: 'Im Unterricht nachfragen, wenn ich etwas nicht verstehe' },
    g: { wohl: 6, staerke: 'merkt sich Daten gut', thema: ['Verstehen'], schwierig: 'Textaufgaben: weiß nicht, was gerechnet werden soll.', hilfen: ['Fünf-Schritte-Lesemethode', 'Fachlehrkraft / Lernpartner'], vereinbarung: 'Textaufgaben mit der Fünf-Schritte-Methode lesen, Wichtiges markieren.', wann: 'bei jeder Textaufgabe, Rückblick in 4 Wochen', weitergabe: 'Nein, das möchte ich nicht.' } },
  { v: 'Ella', n: 'Fuchs', a: { wohl: 7, klasse: 'wohl / zugehörig', gut_belastet: 'Musik machen.', zuversicht: 'meistens', schwer: ['Prüfungsdruck'], gut: 'Mathe, Musik', thema: 'Ich bin vor Schulaufgaben sehr nervös.', wunsch: ['Einfach reden', 'Tipps zum Lernen'], schritt: 'Am Vorabend nicht mehr lernen, sondern etwas Schönes machen' },
    g: { wohl: 7, staerke: 'sehr gute Vorbereitung', thema: ['Wohlbefinden / Miteinander'], schwierig: 'Blackout in der Physik-Schulaufgabe.', hilfen: ['Wiederholen / Selbstabfrage', 'Vertrauensperson / weitere Beratung'], vereinbarung: 'Probe-Schulaufgabe zu Hause unter Zeitdruck; Atemübung vor dem Start.', wann: 'vor der nächsten Schulaufgabe', weitergabe: 'Ja, das ist okay.' } },
  { v: 'Finn', n: 'Gruber', a: { wohl: 4, klasse: 'eher allein', gut_belastet: 'Zocken. Ich habe in der Klasse noch nicht so viele Freunde.', zuversicht: 'eher selten', schwer: ['Motivation / Anfangen', 'Lernplanung', 'Konzentration'], faecher: 'Englisch, Deutsch', gut: 'Informatik', thema: 'Ich weiß nicht, wie ich anfangen soll.', wunsch: ['Einfach reden'], schritt: 'Einmal in der Woche zur Hausaufgabenbetreuung gehen' },
    g: { wohl: 4, staerke: 'sehr gut am Computer', thema: ['Wohlbefinden / Miteinander', 'Planen'], schwierig: 'Fühlt sich in der Klasse noch fremd, wenig Motivation.', hilfen: ['Vertrauensperson / weitere Beratung', 'Lernplan / Lernslots'], vereinbarung: 'Informatik-AG ausprobieren; Hausaufgabenbetreuung am Dienstag.', wann: 'ab nächster Woche, Folgegespräch in 3 Wochen', weitergabe: 'Ja, das ist okay.' } },
  { v: 'Greta', n: 'Huber', a: { wohl: 8, klasse: 'wohl / zugehörig', gut_belastet: 'Reiten. Belastet nichts Besonderes.', zuversicht: 'meistens', schwer: ['Konzentration'], faecher: '', gut: 'Kunst, Bio', thema: 'Am Nachmittag kann ich mich schlecht konzentrieren.', wunsch: ['Tipps zum Lernen'], schritt: 'Nach 25 Minuten Lernen eine kurze Pause machen' },
    g: { wohl: 8, staerke: 'kreativ, strukturiert', thema: ['Üben'], schwierig: 'Nach der Schule müde, lernt dann lange ohne Pause.', hilfen: ['Lernplan / Lernslots', 'Mindmap / Tabelle / Zeitstrahl'], vereinbarung: 'Lernen in 25-Minuten-Blöcken mit Pause; Mindmaps für Bio.', wann: 'ab sofort, Rückblick in 4 Wochen', weitergabe: 'Ja, das ist okay.' } },
  { v: 'Mia', n: 'Sommer' }, // noch offen: Scan mit Zweitgerät
];
async function createExample(H, auto = false) {
  const { S, api, K, toast, withBusy } = H;
  if (!auto && !confirm('Ein Beispiel-Coaching „7z“ mit 8 erfundenen Schüler:innen anlegen? 7 haben Fragebogen und Gespräch schon hinter sich, Mia Sommer ist noch offen.')) return;
  const R = DEMO.map(d => ({ v: d.v, n: d.n, t: newToken() }));
  const c = await withBusy('legt das Demo-Coaching an …', async () => {
    const c = (await api('c_save', { klasse: '7z', titel: 'Lerncoaching 1. Halbjahr (Demo)', vorlage: 'rk', gbogen: 'gf', roster_enc: await K.seal(S.keys.pub_key, R), roster_n: R.length, tids: await Promise.all(R.map(x => tidOf(x.t))) })).coaching;
    for (const [i, d] of DEMO.entries()) {
      if (!d.a) continue;
      const x = R[i], tid = await tidOf(x.t), tag = new Date(Date.now() - (10 - i) * 864e5).toISOString().slice(0, 10);
      await api('c_submit', { code: c.code, tid, identity_enc: await K.seal(S.keys.pub_key, { v: x.v, n: x.n, t: x.t }), answers_enc: await K.seal(S.keys.pub_key, { vorlage: 'rk', answers: d.a, at: Date.now() - (12 - i) * 864e5 }) });
      await api('c_note', { id: c.id, tid, done: true, note_enc: await K.seal(S.keys.pub_key, { v: 1, gbogen: 'gf', datum: tag, done: true, data: { ...d.g, wieder: new Date(Date.now() + (14 + i * 3) * 864e5).toISOString().slice(0, 10) } }) });
    }
    return c;
  });
  if (auto) return c;
  location.hash = '#/c/' + c.id; toast('✓ Demo-Coaching angelegt (erfundene Daten)');
}
