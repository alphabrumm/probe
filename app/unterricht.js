// Probe – Modul Unterricht (Variante Lernpfad/Challenge), Seite der Lehrkraft.
// Ebenen: Lernpfad (Material, „Meine Lernpfade“) → Klasse (dieselbe wie bei Prüfungen; trägt die QR-Kopplung) → Unterrichtseinheit
// (ein Lernpfad, in der Klasse gestartet; läuft über mehrere Stunden, bis die Lehrkraft sie beendet).
// Verschlüsselung: Lernpfade für die Lehrkraft; gestartete Einheiten mit dem Klassenschlüssel, den die Schüler-Geräte nur aus dem
// QR-Code kennen; Bearbeitungsstände der Schüler für die Lehrkraft. Der Server kennt keine Namen, nur feste Kennungen (sid).
import { loadClass } from './klassen.js';
import { qrMatrix } from './qr.js';
import { Pdf, PAGE_W, PAGE_H, fit, wrap } from './pdf.js';
import { unzip } from './zip.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const plain = s => String(s || '').replace(/<[^>]*>/g, '').trim();
const FORM = { lernpfad: 'Lernpfad', challenge: 'Challenge' };
let POLL = null; // Abfrage des Dashboards (endet von selbst, wenn die Seite gewechselt wird)

/* ---------- Übersicht: Klassen + Meine Lernpfade ---------- */
export async function viewUnterricht(H) {
  const { main, api, esc, S, fmtDate } = H;
  main.innerHTML = '<p class="help">lädt …</p>';
  let C, L; try { [C, L] = await Promise.all([api('ut_classes', { schuljahr: S.sj }), api('lp_list')]); } catch (er) { main.innerHTML = `<p class="err">${esc(er.message)}</p>`; return; }
  main.innerHTML = `<h1>Unterricht</h1><p class="sub">Lernpfade und Challenges in der Klasse starten und live sehen, wie weit die Schüler sind. Schuljahr ${esc(C.schuljahr)}</p>
    <h2>Klassen</h2>
    ${C.items.length ? `<div class="tiles">${C.items.map(c => `<a class="tile" href="#/uk/${c.id}"><span class="k">${esc(c.fach || 'alle Fächer')}</span><span class="t">${esc(c.name)}</span>
      <span class="m">${+c.roster_n} Schüler:innen · ${+c.paired} gekoppelt</span><span class="s">${+c.running ? `<span class="chip good">▶ ${+c.running} läuft</span>` : ''}${+c.units ? `<span class="chip">${+c.units} Einheit${+c.units === 1 ? '' : 'en'}</span>` : ''}</span></a>`).join('')}</div>`
      : '<p class="help">Noch keine Klassen in diesem Schuljahr – Klassen legst du unter „Prüfungen“ an (＋ Neue Klasse); sie gelten auch hier.</p>'}
    <div class="bar" style="margin-top:28px"><h2 style="margin:0">Meine Lernpfade</h2><span class="sp"></span><button class="btn" id="lpImp" title="Aus PathFinder exportierter Lernpfad: HTML-Datei, SCORM-Paket (.zip) oder .json">⤒ Datei einlesen</button><button class="btn pri" id="lpNew">＋ Neuer Lernpfad</button></div>
    ${L.items.length ? `<div class="tiles">${L.items.map(x => `<div class="tile lp-t"><span class="k">${esc(FORM[x.form] || 'Lernpfad')}</span><span class="t">${esc(x.title || 'ohne Titel')}</span>
      <span class="m">geändert ${esc(fmtDate(new Date(x.updated * 1000).toISOString().slice(0, 10)))}</span><span class="s"><button class="btn sm" data-ed="${x.id}">✎ Bearbeiten</button><button class="btn sm ghost danger" data-del="${x.id}" title="Löschen">🗑</button></span></div>`).join('')}</div>`
      : '<p class="help">Noch keine Lernpfade. Erstelle einen mit „＋ Neuer Lernpfad“ (PathFinder-Editor) oder lies einen aus PathFinder exportierten Lernpfad ein (HTML-Datei, SCORM-Paket oder .json) – gespeichert wird nur der Lernpfad selbst, ohne den Player.</p>'}
    <p class="help">Lernpfade liegen verschlüsselt auf dem Server und sind auf all deinen Geräten gleich. Gestartet wird ein Lernpfad in einer Klasse (Klasse öffnen → „＋ Lernpfad starten“).</p>`;
  $('#lpNew').onclick = () => editLp(H, null, null);
  $('#lpImp').onclick = () => H.pickFile('.json,.html,.htm,.zip,application/json,text/html,application/zip', async f => {
    try { const d = await readLp(f); await saveLp(H, null, d); H.toast(`✓ „${esc(plain(d.title) || 'Lernpfad')}“ eingelesen`); viewUnterricht(H); } catch (er) { H.toast('⚠ ' + esc(er.message), 6000); }
  });
  main.onclick = async ev => {
    const ed = ev.target.closest('[data-ed]'), del = ev.target.closest('[data-del]');
    if (ed) { try { const { item } = await api('lp_get', { id: +ed.dataset.ed }); editLp(H, item.id, await H.K.open(S.priv, item.doc_enc)); } catch (er) { H.toast('⚠ ' + esc(er.message)); } }
    if (del && confirm('Diesen Lernpfad löschen? Schon gestartete Einheiten bleiben erhalten.')) { await api('lp_del', { id: +del.dataset.del }); viewUnterricht(H); }
  };
}
/** Lernpfad aus einer Datei: PathFinder-JSON, aus PathFinder exportierte HTML-Datei (auch im Originaldesign) oder SCORM-/ZIP-Paket.
    Aus HTML wird nur das eingebettete PathFinder-Dokument übernommen – der Player bleibt draußen. */
async function readLp(f) {
  const fromHtml = html => {
    const m = html.match(/<script type="application\/json" id="pf-doc">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('In dieser HTML-Datei steckt kein PathFinder-Lernpfad (nur Lernpfade, die mit PathFinder exportiert wurden, lassen sich einlesen; ältere bitte erst in PathFinder öffnen).');
    return JSON.parse(m[1]);
  };
  let d;
  if (/\.zip$/i.test(f.name) || f.type === 'application/zip') {
    const Z = await unzip(await f.arrayBuffer()), h = Z.filter(z => /\.html?$/i.test(z.name)).sort((a, b) => (/index\.html?$/i.test(b.name) ? 1 : 0) - (/index\.html?$/i.test(a.name) ? 1 : 0));
    if (!h.length) throw new Error('Im ZIP-Paket ist keine HTML-Datei.');
    let err; for (const z of h) { try { d = fromHtml(await z.text()); break; } catch (e) { err = e; } } if (!d) throw err;
  } else {
    const t = await f.text();
    d = /^\s*[{[]/.test(t) ? JSON.parse(t) : fromHtml(t);
  }
  if (!Array.isArray(d?.stations)) throw new Error('Keine PathFinder-Datei');
  if (!['lernpfad', 'challenge'].includes(d.form)) d.form = 'lernpfad';
  delete d.exam; return d;
}
async function saveLp(H, id, d) {
  return (await H.api('lp_save', { id: id || 0, title: plain(d.title), form: d.form === 'challenge' ? 'challenge' : 'lernpfad', doc_enc: await H.K.seal(H.S.keys.pub_key, d) })).id;
}
/** PathFinder-Editor im Overlay (Formen Lernpfad und Challenge); speichert laufend verschlüsselt */
function editLp(H, id, doc) {
  const { esc, toast } = H, w = document.createElement('div'); w.className = 'editor';
  w.innerHTML = '<iframe src="editor.html" title="Lernpfad bearbeiten"></iframe>'; document.body.appendChild(w); document.body.style.overflow = 'hidden';
  const fr = $('iframe', w); let timer = null, pending = null, saving = Promise.resolve();
  const flush = () => { clearTimeout(timer); if (!pending) return saving; const d = pending; pending = null; saving = saving.then(async () => { id = await saveLp(H, id, d); }).catch(er => toast('⚠ Speichern fehlgeschlagen: ' + esc(er.message), 5000)); return saving; };
  const close = async () => { await flush(); w.remove(); document.body.style.overflow = ''; H.cleanLocal(); if (location.hash === '#/unterricht') viewUnterricht(H); };
  const onMsg = ev => {
    if (ev.source !== fr.contentWindow || ev.data?.probeEditor !== 'ready') return; removeEventListener('message', onMsg);
    fr.contentWindow.probeEdit({ doc: doc || undefined, startDialog: !doc, forms: ['lernpfad', 'challenge'],
      host: { saved: d => { pending = d; clearTimeout(timer); timer = setTimeout(flush, 1500); }, done: d => { pending = d; close(); }, doneLabel: 'Fertig – zurück zu Probe', doneTitle: 'Lernpfad speichern und zurück' } });
  };
  addEventListener('message', onMsg); addEventListener('pagehide', flush, { once: true });
}

/* ---------- Klasse: laufende Einheiten (live), beendete, Bearbeitungsstatistik, Kopplung ---------- */
export async function viewUClass(H, cid) {
  const { main, api, esc, S, K } = H;
  clearInterval(POLL); main.innerHTML = '<p class="help">entschlüsselt …</p>';
  let D, R;
  try { [D, R] = await Promise.all([loadClass(H, cid), api('ut_class', { id: cid })]); } catch (er) { main.innerHTML = `<a class="back" href="#/unterricht">‹ Unterricht</a><p class="err">${esc(er.message)}</p>`; return; }
  const P = { cid, c: R.class, roster: D.roster, couplings: R.couplings, units: R.units, prog: new Map(), dev: new Map(), since: 0, ukey: R.ukey_enc, now: R.now, k: null, showOld: false };
  await pull(H, P);
  draw(H, P);
  POLL = setInterval(async () => {
    if (location.hash !== `#/uk/${cid}`) { clearInterval(POLL); return; }
    if (document.visibilityState !== 'visible' || $('.dlg')) return;
    try { if (await pull(H, P)) drawLive(H, P); else drawSeen(H, P); } catch (er) { }
  }, 7000);
}
/** neue Bearbeitungsstände holen und entschlüsseln; true, wenn sich etwas geändert hat */
async function pull(H, P) {
  const r = await H.api('ut_status', { id: P.cid, since: P.since }); P.now = r.now; let ch = false;
  P.dev = new Map(r.devices.map(d => [d.sid, { seen: +d.seen || 0, paired: !!+d.paired }]));
  for (const x of r.progress) {
    let d = null; try { d = await H.K.open(H.S.priv, x.data_enc); } catch (er) { continue; }
    if (!P.prog.has(+x.unit_id)) P.prog.set(+x.unit_id, new Map());
    P.prog.get(+x.unit_id).set(x.sid, { ...d, updated: +x.updated, submitted: x.submitted ? +x.submitted : null }); ch = true;
  }
  P.since = r.now - 1; return ch;
}
const ago = (now, t) => !t ? '–' : now - t < 75 ? 'gerade aktiv' : now - t < 3600 ? `vor ${Math.round((now - t) / 60)} min` : now - t < 86400 ? `vor ${Math.round((now - t) / 3600)} h` : new Date(t * 1000).toLocaleDateString('de-DE');
const forSid = (u, sid) => !u.targets || (JSON.parse(u.targets) || []).includes(sid);
function draw(H, P) {
  const { main, esc } = H, run = P.units.filter(u => u.status === 'laeuft'), done = P.units.filter(u => u.status !== 'laeuft');
  const paired = P.roster.filter(r => P.dev.get(r.sid)?.paired).length;
  main.innerHTML = `<a class="back" href="#/unterricht">‹ Unterricht</a>
    <h1>${esc(P.c.name)}${P.c.fach ? ' ' + esc(P.c.fach) : ''}</h1><p class="sub">Schuljahr ${esc(P.c.schuljahr)} · ${P.roster.length} Schüler:innen · ${paired} gekoppelt <span class="c-lock">🔒 Namen und Stände nur für dich lesbar</span></p>
    <div class="bar"><button class="btn pri" id="uStart">＋ Lernpfad starten</button><span class="sp"></span><button class="btn" id="uQr">▦ QR-Codes zum Koppeln${P.roster.length - paired ? ` (${P.roster.length - paired} offen)` : ''}</button></div>
    <div id="uRun">${runHtml(H, P, run)}</div>
    ${done.length ? `<section class="card"><h2>Beendete Einheiten</h2><div class="tiles">${done.slice(0, 3).map(u => unitTile(H, P, u)).join('')}</div>
      ${done.length > 3 ? `<details class="u-old"${P.showOld ? ' open' : ''}><summary>Ältere Unterrichtseinheiten (${done.length - 3})</summary><div class="tiles">${done.slice(3).map(u => unitTile(H, P, u)).join('')}</div></details>` : ''}</section>` : ''}
    ${P.units.length ? `<section class="card"><h2>Bearbeitungsstatistik</h2>${statHtml(H, P)}</section>` : ''}
    <section class="card"><h2>Kopplung</h2><p class="help">Jede Schülerin, jeder Schüler scannt einmal den eigenen QR-Code – danach ist das iPad mit dieser Klasse gekoppelt (App „Probe Unterricht“ auf dem Home-Bildschirm). Ein QR-Code gilt nur einmal; für ein neues oder zweites Gerät hier einen neuen erzeugen.</p>
      <div id="uCpl">${couplingHtml(H, P)}</div></section>`;
  $('#uStart').onclick = () => startDialog(H, P);
  $('#uQr').onclick = () => qrDialog(H, P, P.roster.filter(r => !P.dev.get(r.sid)?.paired).map(r => r.sid));
  main.onclick = ev => onClick(H, P, ev);
  const old = $('.u-old', main); if (old) old.ontoggle = () => { P.showOld = old.open; };
}
function runHtml(H, P, run) {
  const { esc } = H;
  if (!run.length) return '<section class="card"><p class="help" style="margin:0">Gerade läuft nichts. „＋ Lernpfad starten“ schickt einen Lernpfad an die Klasse – er erscheint auf den gekoppelten iPads von selbst.</p></section>';
  return run.map(u => `<section class="card u-live"><div class="bar"><h2 style="margin:0">▶ ${esc(u.title || 'ohne Titel')}</h2><span class="help">${esc(FORM[u.form] || '')} · seit ${new Date(u.started * 1000).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}${u.targets ? ` · für ${JSON.parse(u.targets).length} Schüler` : ''}</span><span class="sp"></span>
    <button class="btn sm" data-uend="${u.id}" title="Einheit beenden: Stand einfrieren, Abgaben einsammeln">■ Beenden</button></div>${liveTable(H, P, u)}</section>`).join('');
}
function liveTable(H, P, u, frozen = false) {
  const { esc } = H, M = P.prog.get(u.id) || new Map(), R = P.roster.filter(r => forSid(u, r.sid) || M.has(r.sid));
  const st = [...M.values()].find(x => x.sum?.st)?.sum.st || [];
  const sub = [...M.values()].filter(x => x.submitted).length, act = R.filter(r => P.now - (P.dev.get(r.sid)?.seen || 0) < 120).length;
  return `<p class="help" style="margin:6px 0">${frozen ? '' : `${act} gerade aktiv · `}${M.size} von ${R.length} haben begonnen · ${sub} abgegeben</p>
    <div class="scroll-x"><table class="t u-tab"><tr><th>Name</th>${frozen ? '' : '<th>zuletzt</th>'}<th>Fortschritt</th>${st.map((s, i) => `<th class="u-st" title="${esc(s.t)}">${i + 1}</th>`).join('')}<th title="geöffnete Tipps">Tipps</th><th title="aktive Bearbeitungszeit">Zeit</th><th>Abgabe</th></tr>
    ${R.map(r => { const x = M.get(r.sid), s = x?.sum, seen = P.dev.get(r.sid)?.seen;
      return `<tr><td><b>${esc(r.n)}</b>, ${esc(r.v)}</td>${frozen ? '' : `<td class="help${P.now - (seen || 0) < 120 ? ' u-on' : ''}">${P.dev.get(r.sid)?.paired ? esc(ago(P.now, seen)) : '<span title="noch nicht gekoppelt">nicht gekoppelt</span>'}</td>`}
        <td>${s ? `<span class="u-bar"><i style="width:${s.pct}%"></i></span> ${s.pct} %${s.total ? ` <span class="help">(${s.solved}/${s.total})</span>` : ''}` : '<span class="help">nicht begonnen</span>'}</td>
        ${st.map(t => { const y = s?.st?.find(z => z.id === t.id); return `<td class="u-st ${!y ? '' : y.of ? (y.n === y.of ? 'ok' : y.n ? 'half' : y.v ? 'seen' : '') : y.v ? 'ok' : ''}" title="${esc(t.t)}${y ? `: ${y.of ? `${y.n}/${y.of} gelöst` : y.v ? 'angesehen' : ''}${y.tips ? `, ${y.tips} Tipp${y.tips === 1 ? '' : 's'}` : ''}${y.sols ? `, ${y.sols} Lösung${y.sols === 1 ? '' : 'en'}` : ''}` : ''}">${y ? (y.of ? (y.n === y.of ? '✓' : y.n ? `${y.n}/${y.of}` : y.v ? '·' : '') : y.v ? '✓' : '') : ''}</td>`; }).join('')}
        <td>${s ? s.st.reduce((a, z) => a + (z.tips || 0), 0) || '' : ''}</td><td class="help">${s ? `${s.mins} min` : ''}</td><td>${x?.submitted ? `<span class="chip good" title="${esc(new Date(x.submitted * 1000).toLocaleString('de-DE'))}">✓</span>` : ''}</td></tr>`; }).join('')}</table></div>`;
}
function drawLive(H, P) { const el = $('#uRun'); if (el) el.innerHTML = runHtml(H, P, P.units.filter(u => u.status === 'laeuft')); const c = $('#uCpl'); if (c) c.innerHTML = couplingHtml(H, P); }
function drawSeen(H, P) { drawLive(H, P); }
function unitTile(H, P, u) {
  const { esc } = H, M = P.prog.get(u.id) || new Map(), n = P.roster.filter(r => forSid(u, r.sid)).length || M.size, pct = M.size ? Math.round([...M.values()].reduce((a, x) => a + (x.sum?.pct || 0), 0) / Math.max(n, 1)) : 0;
  return `<button type="button" class="tile" data-uopen="${u.id}"><span class="k">${esc(FORM[u.form] || 'Lernpfad')}</span><span class="t">${esc(u.title || 'ohne Titel')}</span>
    <span class="m">${new Date(u.started * 1000).toLocaleDateString('de-DE')} – ${u.ended ? new Date(u.ended * 1000).toLocaleDateString('de-DE') : ''}</span><span class="s"><span class="chip">Ø ${pct} %</span><span class="chip">${[...M.values()].filter(x => x.submitted).length} Abgaben</span></span></button>`;
}
function statHtml(H, P) {
  const { esc } = H, U = P.units.slice().reverse();
  return `<div class="scroll-x"><table class="t u-tab"><tr><th>Name</th>${U.map(u => `<th class="k-ex" title="${esc(u.title)}">${esc((u.title || '–').slice(0, 14))}${(u.title || '').length > 14 ? '…' : ''}<br><span class="help">${new Date(u.started * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}</span></th>`).join('')}<th>Ø</th></tr>
    ${P.roster.map(r => { const v = U.filter(u => forSid(u, r.sid)).map(u => P.prog.get(u.id)?.get(r.sid)?.sum?.pct ?? 0);
      return `<tr><td><b>${esc(r.n)}</b>, ${esc(r.v)}</td>${U.map(u => { if (!forSid(u, r.sid)) return '<td class="help">–</td>'; const x = P.prog.get(u.id)?.get(r.sid); return `<td>${x ? `${x.sum?.pct ?? 0} %${x.submitted ? ' ✓' : ''}` : '<span class="help">0 %</span>'}</td>`; }).join('')}<td><b>${v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) + ' %' : ''}</b></td></tr>`; }).join('')}</table></div>
    <p class="help">Prozent = gelöste Aufgaben des Lernpfads (ohne Aufgaben: angesehene Stationen) · ✓ abgegeben · – nicht für diese Person gestartet. Das ist keine Note.</p>`;
}
function couplingHtml(H, P) {
  const { esc } = H;
  const st = r => { const C = P.couplings.filter(k => k.sid === r.sid), d = P.dev.get(r.sid);
    if (C.some(k => +k.revoked) && !d?.paired) return '<span class="chip warn">abgemeldet</span>';
    if (d?.paired) return `<span class="chip good">gekoppelt</span> <span class="help">${esc(ago(P.now, d.seen))}</span>`;
    if (C.some(k => +k.open)) return '<span class="chip">QR-Code erstellt, noch nicht gescannt</span>';
    return '<span class="help">nicht gekoppelt</span>'; };
  return `<div class="scroll-x"><table class="t"><tr><th>Name</th><th>Status</th><th></th></tr>${P.roster.map(r => `<tr><td><b>${esc(r.n)}</b>, ${esc(r.v)}</td><td>${st(r)}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-uqr="${esc(r.sid)}" title="Neuen QR-Code erzeugen (z. B. für ein neues oder zweites Gerät)">▦ Neuer QR-Code</button>${P.dev.get(r.sid)?.paired ? ` <button class="btn sm ghost danger" data-urev="${esc(r.sid)}" title="Alle Geräte dieser Person abmelden">Abmelden</button>` : ''}</td></tr>`).join('')}</table></div>`;
}
async function onClick(H, P, ev) {
  const { api, esc, toast, dialog } = H, b = ev.target.closest('[data-uend],[data-uqr],[data-urev],[data-uopen]'); if (!b) return;
  if (b.dataset.uend && confirm('Einheit beenden? Der Stand wird eingefroren, die Schüler können nicht mehr weiterarbeiten (wieder öffnen ist möglich).')) { await api('ut_unit', { unit: +b.dataset.uend, op: 'end' }); return reload(H, P); }
  if (b.dataset.uqr) return qrDialog(H, P, [b.dataset.uqr]);
  if (b.dataset.urev && confirm('Alle Geräte dieser Person abmelden? Sie braucht danach einen neuen QR-Code.')) { await api('ut_revoke', { id: P.cid, sid: b.dataset.urev }); return reload(H, P); }
  if (b.dataset.uopen) {
    const u = P.units.find(x => x.id === +b.dataset.uopen); if (!u) return;
    const d = dialog(`${esc(u.title || 'Einheit')}`, `<p class="help">${esc(FORM[u.form] || '')} · ${new Date(u.started * 1000).toLocaleDateString('de-DE')} bis ${u.ended ? new Date(u.ended * 1000).toLocaleDateString('de-DE') : '–'}</p>${liveTable(H, P, u, true)}
      <div class="btns"><button class="btn" data-op="reopen">▶ Wieder öffnen</button><button class="btn ghost danger" data-op="del">🗑 Einheit löschen</button></div>`, { wide: true });
    d.el.onclick = async e2 => { const o = e2.target.closest('[data-op]')?.dataset.op; if (!o) return;
      if (o === 'del' && !confirm('Einheit mit allen Bearbeitungsständen löschen?')) return;
      try { await api('ut_unit', { unit: u.id, op: o }); d.close(); reload(H, P); } catch (er) { toast('⚠ ' + esc(er.message)); } };
  }
}
async function reload(H, P) { const R = await H.api('ut_class', { id: P.cid }); Object.assign(P, { couplings: R.couplings, units: R.units, now: R.now }); await pull(H, P); draw(H, P); }

/** Klassenschlüssel (einmal je Klasse; steckt in den QR-Codes) */
async function classKey(H, P) {
  if (P.k) return P.k;
  let enc = P.ukey;
  if (!enc) { enc = (await H.api('ut_key', { id: P.cid, ukey_enc: await H.K.seal(H.S.keys.pub_key, { k: H.K.newExamKey() }) })).ukey_enc; P.ukey = enc; }
  P.k = (await H.K.open(H.S.priv, enc)).k; return P.k;
}

/* ---------- Lernpfad starten ---------- */
async function startDialog(H, P) {
  const { api, esc, dialog, toast, S, K, withBusy } = H;
  let L; try { L = (await api('lp_list')).items; } catch (er) { toast('⚠ ' + esc(er.message)); return; }
  if (!L.length) { toast('Noch keine Lernpfade – lege unter „Unterricht“ → „Meine Lernpfade“ einen an.', 6000); return; }
  const d = dialog('＋ Lernpfad starten', `<label class="f">Lernpfad<select id="lp">${L.map(x => `<option value="${x.id}">${esc(x.title || 'ohne Titel')} (${esc(FORM[x.form] || 'Lernpfad')})</option>`).join('')}</select></label>
    <fieldset class="prefs"><legend>Für wen?</legend><label class="pref"><input type="radio" name="tg" value="all" checked><span><b>ganze Klasse</b></span></label>
      <label class="pref"><input type="radio" name="tg" value="sel"><span><b>nur ausgewählte Schüler</b><small>z. B. zum Nachholen oder als Zusatzaufgabe</small></span></label>
      <div id="tgl" hidden class="u-sel">${P.roster.map(r => `<label><input type="checkbox" value="${esc(r.sid)}"> ${esc(r.n)}, ${esc(r.v)}</label>`).join('')}</div></fieldset>
    <p class="help">Der Lernpfad erscheint auf den gekoppelten iPads innerhalb weniger Sekunden. Er bleibt offen, bis du die Einheit beendest – auch über mehrere Stunden.</p>
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">▶ Starten</button></div>`);
  d.el.onchange = () => { $('#tgl', d.el).hidden = $('[name=tg]:checked', d.el).value !== 'sel'; };
  $('#go', d.el).onclick = async () => {
    const sel = $('[name=tg]:checked', d.el).value === 'sel' ? $$('#tgl input:checked', d.el).map(x => x.value) : null;
    if (sel && !sel.length) { $('#err', d.el).textContent = 'Bitte mindestens eine Person auswählen.'; return; }
    $('#go', d.el).disabled = true;
    try {
      await withBusy('Lernpfad wird gestartet …', async () => {
        const { item } = await api('lp_get', { id: +$('#lp', d.el).value }), doc = await K.open(S.priv, item.doc_enc);
        doc.id = 'u-' + b64u(crypto.getRandomValues(new Uint8Array(9))); // eigener Fortschritt je Einheit auf den Schüler-Geräten
        await api('ut_start', { id: P.cid, title: plain(doc.title) || item.title, form: item.form, doc_enc: await K.sealExamDoc(await classKey(H, P), doc), ...(sel ? { targets: sel } : {}) });
      });
      d.close(); toast('▶ Gestartet'); reload(H, P);
    } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
  };
}

/* ---------- QR-Codes zum Koppeln (je Person ein Einmal-Code; Inhalt nur im Teil hinter „#“) ---------- */
async function qrDialog(H, P, sids) {
  const { api, esc, dialog, toast, withBusy, S } = H;
  const R = P.roster.filter(r => sids.includes(r.sid));
  if (!R.length) { toast('Alle sind schon gekoppelt. Für ein neues Gerät: „▦ Neuer QR-Code“ bei der Person.', 5000); return; }
  const d = dialog('▦ QR-Codes zum Koppeln', `<p>${R.length === 1 ? `Neuer QR-Code für <b>${esc(R[0].v)} ${esc(R[0].n)}</b>.` : `QR-Codes für <b>${R.length}</b> Schüler:innen, die noch nicht gekoppelt sind.`}
    Jeder Code gilt <b>einmal</b>: Beim Scannen wird das iPad mit dieser Klasse gekoppelt. Noch nicht gescannte ältere Codes derselben Person werden ungültig.</p>
    <p class="help">Das PDF enthält Namen und einen geheimen Schlüssel – nach dem Austeilen am besten nicht herumliegen lassen.</p>
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">⇩ QR-Codes als PDF</button></div>`);
  $('#go', d.el).onclick = async () => {
    $('#go', d.el).disabled = true;
    try {
      const bytes = await withBusy('QR-Codes werden erstellt …', async () => {
        const k = await classKey(H, P), base = new URL('l.html', location.href).href.replace(/[?#].*$/, ''), items = [], cards = [];
        for (const r of R) {
          const s = b64u(crypto.getRandomValues(new Uint8Array(16)));
          items.push({ sid: r.sid, qr_hash: await sha256hex(s) });
          // kurz halten (QR-Code bis 213 Zeichen): Klasse.Geheimnis.Klassenschlüssel.Name – Klasse, Fach und Lehrkraft liefert der Server nach dem Koppeln
          cards.push({ r, link: `${base}#u=${P.cid}.${s}.${k}.${encodeURIComponent(`${r.v}|${r.n}`.slice(0, 40))}` });
        }
        await api('ut_qr', { id: P.cid, items });
        return qrPdf(P, cards);
      });
      const { showPdf } = await import('./pdf.js'); showPdf(bytes, `QR-Kopplung_${P.c.name}_${P.c.fach || ''}.pdf`.replace(/\s+/g, '_'));
      d.close(); reload(H, P);
    } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
  };
}
function qrPdf(P, cards) {
  const pdf = new Pdf(`QR-Codes ${P.c.name} ${P.c.fach || ''}`), MM = 72 / 25.4, M = 14 * MM, W = (PAGE_W - 2 * M) / 2, Hh = (PAGE_H - 2 * M) / 2, Q = 52 * MM;
  cards.forEach(({ r, link }, i) => {
    if (i && i % 4 === 0) pdf.addPage();
    const x0 = M + (i % 2) * W, y0 = M + (Math.floor(i / 2) % 2) * Hh;
    pdf.line(x0 + 4, y0 + 4, x0 + W - 4, y0 + 4, '#dddddd', 0.4); // Schnittlinien angedeutet
    let y = y0 + 30;
    pdf.text(fit(`${r.v} ${r.n}`, 17, true, W - 24), x0 + 12, y, 17, { bold: true }); y += 17;
    pdf.text(fit(`${P.c.name}${P.c.fach ? ' · ' + P.c.fach : ''} · Probe Unterricht`, 10.5, false, W - 24), x0 + 12, y, 10.5, { col: '#555555' }); y += 12;
    const QM = qrMatrix(link), c = Q / QM.length, qx = x0 + (W - Q) / 2, qy = y + 4;
    pdf.color('#000000');
    QM.forEach((row, yy) => { let s0 = -1; for (let xx = 0; xx <= row.length; xx++) { const on = xx < row.length && row[xx]; if (on && s0 < 0) s0 = xx; if (!on && s0 >= 0) { pdf.ops.push(`${(qx + s0 * c).toFixed(2)} ${(PAGE_H - qy - (yy + 1) * c).toFixed(2)} ${((xx - s0) * c).toFixed(2)} ${c.toFixed(2)} re f`); s0 = -1; } } });
    y = qy + Q + 16;
    for (const l of wrap('1. Mit der Kamera scannen und den Link öffnen. 2. In Safari: Teilen → „Zum Home-Bildschirm“. 3. Ab jetzt über das Symbol „Probe Unterricht“ starten. Der Code gilt nur einmal.', 8.5, false, W - 24)) { pdf.text(l, x0 + 12, y, 8.5, { col: '#555555' }); y += 11; }
  });
  return pdf.bytes();
}
