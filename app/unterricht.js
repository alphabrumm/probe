// Probe – Modul Unterricht (Variante Lernpfad/Challenge), Seite der Lehrkraft.
// Ebenen: Lernpfad (Material, „Meine Lernpfade“) → Klasse (dieselbe wie bei Prüfungen; trägt die QR-Kopplung) → Unterrichtseinheit
// (ein Lernpfad, in der Klasse gestartet; läuft über mehrere Stunden, bis die Lehrkraft sie beendet).
// Verschlüsselung: Lernpfade für die Lehrkraft; gestartete Einheiten mit dem Klassenschlüssel, den die Schüler-Geräte nur aus dem
// QR-Code kennen; Bearbeitungsstände der Schüler für die Lehrkraft. Der Server kennt keine Namen, nur feste Kennungen (sid).
import { loadClass } from './klassen.js';
import { qrMatrix, qrSvg } from './qr.js';
import { Pdf, PAGE_W, PAGE_H, fit, wrap } from './pdf.js';
import { unzip } from './zip.js';
import * as PA from './papps.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const plain = s => String(s || '').replace(/<[^>]*>/g, '').trim();
const FORM = { lernpfad: 'Lernpfad', challenge: 'Challenge', jpad: '☕ JPad', papp: '🧩 Lernpfad + App' };
/** Einordnung als kurze Zeile: „Physik · 8. Jgst. · 2 Optik“ */
const metaLine = m => [m?.fach, m?.jg ? `${m.jg}. Jgst.` : '', m?.lbt].filter(Boolean).join(' · ');
/** Jahrgangsstufe aus dem Klassennamen („8b“ → 8, „Q11“ → 11) */
const jgOf = name => { const n = +(String(name || '').match(/\d{1,2}/) || [])[0]; return n >= 5 && n <= 13 ? n : 0; };
let LPF = { fach: '', jg: '' }; // Filter in „Meine Lernpfade“
let UAPPS = {}; // Adressen der Apps im Unterricht (JPad …), kommen mit lp_list
/** Name in den Tabellen; über den Tafel-QR-Code selbst eingetragene sind markiert */
const nameCell = (esc, r) => `<b>${esc(r.n)}</b>, ${esc(r.v)}${r.self ? ' <span class="chip warn" title="über den Tafel-QR-Code selbst eingetragen – noch keinem Namen der Klasse zugeordnet">selbst eingetragen</span>' : ''}`;
const TAFEL = new Map(); // offener Tafel-Code je Klasse (Geheimnis und PIN nur hier im Browser): cid → { s, pin, until (ms) }
let POLL = null; // Abfrage des Dashboards (endet von selbst, wenn die Seite gewechselt wird)

/* ---------- Übersicht: Klassen + Meine Lernpfade ---------- */
export async function viewUnterricht(H) {
  const { main, api, esc, S, fmtDate } = H;
  main.innerHTML = '<p class="help">lädt …</p>';
  let C, L; try { [C, L] = await Promise.all([api('ut_classes', { schuljahr: S.sj }), api('lp_list')]); } catch (er) { main.innerHTML = `<p class="err">${esc(er.message)}</p>`; return; }
  UAPPS = L.apps || UAPPS;
  L.items = L.items.filter(x => x.form !== 'app'); // eigene Probe-Apps stehen unten unter „Probe-Apps“
  main.innerHTML = `<h1>Unterricht</h1><p class="sub">Lernpfade und Challenges in der Klasse starten und live sehen, wie weit die Schüler sind. Schuljahr ${esc(C.schuljahr)}</p>
    <h2>Klassen</h2>
    ${C.items.length ? `<div class="tiles">${C.items.map(c => `<a class="tile" href="#/uk/${c.id}"><span class="k">${esc(c.fach || 'alle Fächer')}</span><span class="t">${esc(c.name)}</span>
      <span class="m">${+c.roster_n} Schüler:innen · ${+c.paired} gekoppelt</span><span class="s">${+c.running ? `<span class="chip good">▶ ${+c.running} läuft</span>` : ''}${+c.units ? `<span class="chip">${+c.units} Einheit${+c.units === 1 ? '' : 'en'}</span>` : ''}</span></a>`).join('')}</div>`
      : '<p class="help">Noch keine Klassen in diesem Schuljahr – Klassen legst du unter „Prüfungen“ an (＋ Neue Klasse); sie gelten auch hier.</p>'}
    <div class="bar" style="margin-top:28px"><h2 style="margin:0">Meine Lernpfade</h2><span class="sp"></span><button class="btn" id="lpImp" title="Aus PathFinder exportierter Lernpfad (HTML-Datei, SCORM-Paket .zip oder .json) oder JPad-Projektdatei (.json)">⤒ Datei einlesen</button><button class="btn" id="lpJPad" title="Java-Projekt für JPad: über einen JCode, aus einer Projektdatei oder leer">☕ JPad-Projekt</button><button class="btn pri" id="lpNew">＋ Neuer Lernpfad</button></div>
    ${L.items.some(x => x.meta) ? `<div class="bar lp-filter"><select id="lfF" aria-label="Fach"><option value="">alle Fächer</option>${[...new Set(L.items.map(x => x.meta?.fach).filter(Boolean))].sort().map(f => `<option${LPF.fach === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <select id="lfJ" aria-label="Jahrgangsstufe"><option value="">alle Jahrgangsstufen</option>${[...new Set(L.items.map(x => x.meta?.jg).filter(Boolean))].sort((a, b) => a - b).map(j => `<option value="${j}"${+LPF.jg === j ? ' selected' : ''}>${j}. Jahrgangsstufe</option>`).join('')}</select></div>` : ''}
    ${L.items.length ? `<div class="tiles">${L.items.filter(x => (!LPF.fach || x.meta?.fach === LPF.fach) && (!LPF.jg || +x.meta?.jg === +LPF.jg)).map(x => `<div class="tile lp-t"><span class="k">${esc(FORM[x.form] || 'Lernpfad')}${x.meta ? ' · ' + esc(metaLine(x.meta)) : ''}</span><span class="t">${esc(x.title || 'ohne Titel')}</span>
      <span class="m">geändert ${esc(fmtDate(new Date(x.updated * 1000).toISOString().slice(0, 10)))}</span><span class="s"><button class="btn sm" data-ed="${x.id}">✎ Bearbeiten</button><button class="btn sm ghost danger" data-del="${x.id}" title="Löschen">🗑</button></span></div>`).join('')}</div>`
      : '<p class="help">Noch keine Lernpfade. Erstelle einen mit „＋ Neuer Lernpfad“ (PathFinder-Editor) oder lies einen aus PathFinder exportierten Lernpfad ein (HTML-Datei, SCORM-Paket oder .json) – gespeichert wird nur der Lernpfad selbst, ohne den Player.</p>'}
    <p class="help">Lernpfade liegen verschlüsselt auf dem Server und sind auf all deinen Geräten gleich. Gestartet wird ein Lernpfad in einer Klasse (Klasse öffnen → „＋ Lernpfad starten“).</p>
    <div class="bar" style="margin-top:28px"><h2 style="margin:0">Probe-Apps</h2><span class="sp"></span><button class="btn" id="paOwn" title="Eine eigene kleine Lern-App mit KI bauen lassen">＋ Eigene Probe-App</button></div>
    <p class="help" style="margin-top:0">Probe-Apps laufen im Unterricht links neben einem Lernpfad; App-Aufgaben im Lernpfad prüfen, was die Schüler in der App tun. Im KI-Dialog erscheinen sie in Schritt 2 als „Umsetzung“, wenn das Fach passt.</p>
    <div id="paList"><p class="help">lädt …</p></div>`;
  drawAppList(H);
  $('#lpNew').onclick = () => editLp(H, null, null);
  $('#lpJPad').onclick = () => jpadDialog(H, null, null);
  main.onchange = ev => { if (ev.target.id === 'lfF') LPF.fach = ev.target.value; else if (ev.target.id === 'lfJ') LPF.jg = ev.target.value; else return; viewUnterricht(H); };
  $('#lpImp').onclick = () => H.pickFile('.json,.html,.htm,.zip,application/json,text/html,application/zip', async f => {
    try { const d = await readLp(f); await saveLp(H, null, d); H.toast(`✓ „${esc(plain(d.title) || (d.form === 'jpad' ? 'JPad-Projekt' : 'Lernpfad'))}“ eingelesen`); viewUnterricht(H); } catch (er) { H.toast('⚠ ' + esc(er.message), 6000); }
  });
  main.onclick = async ev => {
    const ed = ev.target.closest('[data-ed]'), del = ev.target.closest('[data-del]');
    if (ed) { try { const { item } = await api('lp_get', { id: +ed.dataset.ed }), d = await H.K.open(S.priv, item.doc_enc); if (d?.form === 'jpad') { if (d.jcode || !d.project) jpadDialog(H, item.id, d); else authorJPad(H, item.id, d); } else if (d?.form === 'papp') authorApp(H, item.id, d); else editLp(H, item.id, d); } catch (er) { H.toast('⚠ ' + esc(er.message)); } }
    const pa = ev.target.closest('[data-pa]'); if (pa) return appAction(H, pa.dataset.pa, pa.dataset.app);
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
  if (/\.json$/i.test(f.name) || f.type === 'application/json') { // JPad- bzw. Online-IDE-Projektdatei?
    let j = null; try { j = JSON.parse(await f.text()); } catch (e) { }
    const p = Array.isArray(j) ? j[0] : j;
    if (p && Array.isArray(p.modules)) return jpadFromProject(p, f.name);
  }
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
/** JPad-Projektdatei (Format der Online-IDE, ggf. mit eingebettetem Lernpfad) → Material „JPad“ */
function jpadFromProject(p, fname = '') {
  const files = p.modules.filter(m => !m.isFolder && typeof m.name === 'string');
  if (!files.length) throw new Error('Die Projektdatei enthält keine Java-Dateien.');
  const keep = { name: String(p.name || ''), modules: files.map(m => ({ name: m.name, text: String(m.text || '') })) };
  if (typeof p.lernpfadHtml === 'string' && p.lernpfadHtml.trim()) keep.lernpfadHtml = p.lernpfadHtml;
  if (typeof p.spritesheetBase64 === 'string' && p.spritesheetBase64) keep.spritesheetBase64 = p.spritesheetBase64;
  return { form: 'jpad', title: String(p.name || fname.replace(/\.json$/i, '').replace(/^JPad-/, '') || 'JPad-Projekt').slice(0, 120), project: keep };
}
/** JPad-Lernumgebung bauen bzw. bearbeiten: JPad (Modus „autor“) mit Startcode und Lernpfad nebeneinander; der Lernpfad-Editor
    (PathFinder mit Programmier-Aufgaben) läuft in JPad. Jeder Stand – Code, Lernpfad (HTML), Titel – wird verschlüsselt gespeichert. */
async function authorJPad(H, id, m, lernpfadDoc = null) {
  const { esc, toast } = H, A = await import('../vendor/pathfinder/core/pfapp.js');
  let t = null, saving = Promise.resolve(), dirty = !id; // neu: sofort speichern
  const save = () => { clearTimeout(t); if (!dirty) return saving; dirty = false; const snap = JSON.parse(JSON.stringify(m)); saving = saving.then(async () => { id = await saveLp(H, id, snap); }).catch(er => { dirty = true; toast('⚠ Speichern fehlgeschlagen: ' + esc(er.message), 5000); }); return saving; };
  if (!id) save();
  const files = (m.project?.modules || []).map(x => ({ name: String(x.name).replace(/\.java$/, ''), text: x.text || '' }));
  A.openApp({ app: 'jpad', url: UAPPS.jpad, mode: 'autor', task: 'a' + (id || 'neu'), title: m.title || 'JPad-Lernumgebung', files, closeLabel: '✓ Fertig – zurück zu Probe', flushMs: 5000,
    extra: { project: m.project, projectKey: 'a' + Date.now(), ...(lernpfadDoc ? { lernpfadDoc } : {}) },
    onState: st => {
      m.project = { ...(m.project || {}), modules: st.files.map(f => ({ name: f.name + '.java', text: f.text })) };
      if (typeof st.lernpfadHtml === 'string') { if (st.lernpfadHtml) m.project.lernpfadHtml = st.lernpfadHtml; else delete m.project.lernpfadHtml; }
      if (st.lernpfadTitle && plain(st.lernpfadTitle)) m.title = m.project.name = plain(st.lernpfadTitle).slice(0, 120);
      dirty = true; clearTimeout(t); t = setTimeout(save, 2000);
    },
    onClose: async () => { await save(); toast(`✓ „${esc(m.title || 'JPad-Lernumgebung')}“ gespeichert`); if (location.hash === '#/unterricht') viewUnterricht(H); } });
  A.appStatus('wird automatisch gespeichert');
}
/** Material „JPad“: Projekt über einen JCode (JPad lädt es selbst), aus einer Projektdatei oder leer */
function jpadDialog(H, id, doc) {
  const { dialog, esc, toast, withBusy, pickFile } = H; let proj = doc?.project || null;
  const src0 = doc?.jcode ? 'jcode' : proj ? 'datei' : doc ? 'leer' : 'jcode';
  const d = dialog(id ? '☕ JPad-Projekt bearbeiten' : '☕ JPad-Projekt', `<label class="f">Titel<input id="jt" maxlength="120" value="${esc(doc?.title || '')}" placeholder="z. B. Schafe zählen mit Arrays"></label>
    <fieldset class="prefs"><legend>Startcode und Lernpfad</legend>
      <label class="pref"><input type="radio" name="js" value="jcode"${src0 === 'jcode' ? ' checked' : ''}><span><b>JCode</b><small>Projekt aus JPad, z. B. U67CU – mit Lernpfad, falls es einen hat</small></span></label>
      <input id="jc" maxlength="7" value="${esc(doc?.jcode || '')}" placeholder="5 Zeichen" style="max-width:160px;text-transform:uppercase;letter-spacing:.15em">
      <label class="pref"><input type="radio" name="js" value="datei"${src0 === 'datei' ? ' checked' : ''}><span><b>Projektdatei</b><small>in JPad über ⋯ → Datei sichern bzw. Export gespeichert (.json)</small></span></label>
      <div><button class="btn sm" id="jf">⤒ Datei wählen</button> <span class="help" id="jfn">${proj ? esc(`${proj.modules.length} Datei${proj.modules.length === 1 ? '' : 'en'}${proj.lernpfadHtml ? ' + Lernpfad' : ''}`) : ''}</span></div>
      <label class="pref"><input type="radio" name="js" value="leer"${src0 === 'leer' ? ' checked' : ''}><span><b>Leeres Projekt</b><small>die Schüler beginnen mit dem Hauptprogramm</small></span></label></fieldset>
    <p class="help">Gestartet wird das Projekt in einer Klasse („＋ Lernpfad starten“). Die Schüler arbeiten in JPad im PathFinder Player; du siehst live ihren Code.</p>
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">Speichern</button></div>`);
  $('#jf', d.el).onclick = () => pickFile('.json,application/json', async f => {
    try { let j = JSON.parse(await f.text()); if (Array.isArray(j)) j = j[0]; if (!j || !Array.isArray(j.modules)) throw new Error('Das ist keine JPad-Projektdatei.');
      const m = jpadFromProject(j, f.name); proj = m.project; $('#jfn', d.el).textContent = `${f.name}: ${proj.modules.length} Datei${proj.modules.length === 1 ? '' : 'en'}${proj.lernpfadHtml ? ' + Lernpfad' : ''}`;
      if (!$('#jt', d.el).value.trim()) $('#jt', d.el).value = m.title; $('[name=js][value=datei]', d.el).checked = true; $('#err', d.el).textContent = ''; }
    catch (er) { $('#err', d.el).textContent = er.message; }
  });
  $('#go', d.el).onclick = async () => {
    const src = $('[name=js]:checked', d.el).value, t = $('#jt', d.el).value.trim(), code = $('#jc', d.el).value.toUpperCase().replace(/[\s\-_.]/g, '');
    if (src === 'jcode' && !/^[2-9A-HJ-NP-Z]{5}$/.test(code)) { $('#err', d.el).textContent = 'Ein JCode hat genau 5 Zeichen (ohne 0, O, 1 und I).'; return; }
    if (src === 'datei' && !proj) { $('#err', d.el).textContent = 'Bitte eine Projektdatei wählen.'; return; }
    const m = { form: 'jpad', title: t || (src === 'jcode' ? 'JCode ' + code : proj?.name || 'JPad-Projekt'), ...(src === 'jcode' ? { jcode: code } : {}), ...(src === 'datei' ? { project: proj } : {}), meta: doc?.meta || { fach: 'Informatik' } };
    try { await withBusy('wird verschlüsselt …', () => saveLp(H, id, m)); d.close(); toast('✓ Gespeichert'); viewUnterricht(H); } catch (er) { $('#err', d.el).textContent = er.message; }
  };
}
/* ---------- Probe-Apps (Liste, Lernpfad + App bauen, eigene App) ---------- */
async function drawAppList(H) {
  const { esc } = H, el = $('#paList'); if (!el) return;
  let C; try { C = await PA.loadApps(H); } catch (er) { el.innerHTML = `<p class="err">${esc(er.message)}</p>`; return; }
  const A = C.apps.filter(a => PA.allowed(C, a));
  el.innerHTML = `<div class="tiles">${A.map(a => `<div class="tile pa-t"><span class="k">${esc(a.icon || '🧩')} ${esc(a.own ? 'eigene App' : a.kind === 'jpad' ? 'App' : 'Probe-App')}${a.fach ? ' · ' + esc(a.fach) : ''}${a.jg ? ' · ' + esc(a.jg) : ''}</span><span class="t">${esc(a.name)}</span>
    <span class="m">${esc(a.beschreibung || '')}</span><span class="s">${a.ready === false ? '<span class="chip">in Vorbereitung</span>'
      : a.kind === 'jpad' ? '<button class="btn sm" data-pa="jpad">＋ JPad-Projekt</button>'
      : `<button class="btn sm" data-pa="new" data-app="${esc(a.id)}" title="Lernpfad + App anlegen${a.m?.lernpfadText || a.m?.lernpfad ? ' – mit dem Beispiel-Lernpfad der App' : ''}">＋ Lernpfad + App</button>${a.own ? `<button class="btn sm ghost danger" data-pa="del" data-app="${esc(a.id)}" title="App löschen">🗑</button>` : ''}`}</span></div>`).join('')}</div>`;
  $('#paOwn').onclick = () => PA.ownAppDialog(H, { faecher: C.faecher, save: d => saveLp(H, null, d), onDone: () => drawAppList(H) });
}
async function appAction(H, what, appId) {
  const { esc, toast } = H;
  if (what === 'jpad') return jpadDialog(H, null, null);
  const C = await PA.loadApps(H), a = C.apps.find(x => x.id === appId); if (!a) return;
  if (what === 'del') { if (!confirm(`App „${a.name}“ löschen? Schon gebaute Lernpfade mit dieser App behalten ihre Kopie.`)) return; await H.api('lp_del', { id: a.lpid }); PA.dropCache(); drawAppList(H); return; }
  if (what === 'new') { // mit dem Beispiel-Lernpfad der App bzw. einem Gerüst aus ihren Ereignissen
    let lp = null; try { lp = await PA.builtinLernpfad(a); } catch (e) { }
    if (!lp) lp = skeletonDoc(a);
    authorApp(H, null, PA.material(a, lp));
    toast(`🧩 „${esc(a.name)}“: links die App, rechts der Lernpfad – App-Aufgaben prüfen die Ereignisse der App`, 5000);
  }
}
/** Gerüst eines Lernpfads zu einer App: eine Station mit einer App-Aufgabe je Ereignis (höchstens 3) */
function skeletonDoc(a) {
  const id = () => Math.random().toString(36).slice(2, 10), ev = (a.m?.events || []).slice(0, 3);
  return { v: 2, id: id(), form: 'lernpfad', design: { pal: 0, font: 'pixel', shape: 'eckig', hero: 'logo', heroImg: '' }, kicker: a.fach ? String(a.fach).split(',')[0] : '', title: a.name, subtitle: a.beschreibung || '', goals: [], rank: '', anim: {}, typeLines: [],
    stations: [{ id: id(), title: 'Los geht\'s', sub: a.name, check: false, blocks: [{ id: id(), type: 'text', html: `Links siehst du die App <b>${a.name}</b>.` }, ...ev.map(e => ({ id: id(), type: 'apptask', title: e.text || e.name, html: '', event: e.name, count: 1, xp: 10, tips: [], solution: '', solHide: true, img: '' }))] }],
    cert: { on: true, need: 'immer', pct: 80, text: 'hat den Lernpfad mit folgendem Ergebnis bearbeitet:', show: { zeit: true, tipps: true, quiz: true, xp: true } } };
}
function authorApp(H, id, mat) {
  PA.authorPapp(H, { id, mat, save: (i, m) => saveLp(H, i, m), onDone: () => { if (location.hash === '#/unterricht') viewUnterricht(H); } });
}
async function saveLp(H, id, d) {
  return (await H.api('lp_save', { id: id || 0, title: plain(d.title), form: ['challenge', 'jpad', 'papp', 'app'].includes(d.form) ? d.form : 'lernpfad', meta: d.meta || {}, doc_enc: await H.K.seal(H.S.keys.pub_key, d) })).id;
}
const blankDoc = d => !plain(d?.title) && !(d?.stations || []).some(s => plain(s.title) || (s.blocks || []).some(b => b.type !== 'text' || plain(b.html)));
let KIAPPS = []; // Apps für den KI-Dialog (Schritt 2), vor dem Öffnen des Editors geladen
/** PathFinder-Editor im Overlay (Formen Lernpfad und Challenge); speichert laufend verschlüsselt */
async function editLp(H, id, doc) {
  try { KIAPPS = await PA.kiApps(H); } catch (e) { KIAPPS = []; }
  const { esc, toast } = H, w = document.createElement('div'); w.className = 'editor';
  w.innerHTML = '<iframe src="editor.html" title="Lernpfad bearbeiten"></iframe>'; document.body.appendChild(w); document.body.style.overflow = 'hidden';
  const fr = $('iframe', w); let timer = null, pending = null, saving = Promise.resolve();
  const flush = () => { clearTimeout(timer); if (!pending) return saving; const d = pending; pending = null; saving = saving.then(async () => { id = await saveLp(H, id, d); }).catch(er => toast('⚠ Speichern fehlgeschlagen: ' + esc(er.message), 5000)); return saving; };
  const close = async () => { await flush(); w.remove(); document.body.style.overflow = ''; H.cleanLocal(); if (location.hash === '#/unterricht') viewUnterricht(H); };
  const onMsg = ev => {
    if (ev.source !== fr.contentWindow || ev.data?.probeEditor !== 'ready') return; removeEventListener('message', onMsg);
    fr.contentWindow.probeEdit({ doc: doc || undefined, startDialog: !doc, forms: ['lernpfad', 'challenge'],
      // „JPad-Lernumgebung“ (Informatik): weiter in JPad – Startcode und Lernpfad nebeneinander
      kiApps: KIAPPS, appCreate: async (appId, d) => { pending = null; clearTimeout(timer); if (id) H.api('lp_del', { id }).catch(() => { }); w.remove(); document.body.style.overflow = ''; removeEventListener('message', onMsg);
        const C = await PA.loadApps(H), a = C.apps.find(x => x.id === appId); if (a) authorApp(H, null, PA.material(a, d)); },
      jpad: { create: d => { pending = null; clearTimeout(timer); if (id) H.api('lp_del', { id }).catch(() => { }); w.remove(); document.body.style.overflow = ''; removeEventListener('message', onMsg);
        authorJPad(H, null, { form: 'jpad', title: plain(d?.title) || 'JPad-Lernumgebung', meta: d?.meta || { fach: 'Informatik' }, project: { name: plain(d?.title) || 'JPad-Lernumgebung', modules: [{ name: 'Hauptprogramm.java', text: '' }] } }, d || { form: 'lernpfad', title: 'Neuer JPad-Lernpfad', stations: [] }); } },
      host: { saved: d => { if (!id && blankDoc(d)) return; pending = d; clearTimeout(timer); timer = setTimeout(flush, 1500); }, /* leerer Entwurf (z. B. Startdialog abgebrochen): nicht speichern */ done: d => { pending = d; close(); }, doneLabel: 'Fertig – zurück zu Probe', doneTitle: 'Lernpfad speichern und zurück' } });
  };
  addEventListener('message', onMsg); addEventListener('pagehide', flush, { once: true });
}

/* ---------- Klasse: laufende Einheiten (live), beendete, Bearbeitungsstatistik, Kopplung ---------- */
export async function viewUClass(H, cid) {
  const { main, api, esc, S, K } = H;
  clearInterval(POLL); main.innerHTML = '<p class="help">entschlüsselt …</p>';
  let D, R;
  try { [D, R] = await Promise.all([loadClass(H, cid), api('ut_class', { id: cid })]); } catch (er) { main.innerHTML = `<a class="back" href="#/unterricht">‹ Unterricht</a><p class="err">${esc(er.message)}</p>`; return; }
  const P = { cid, c: R.class, apps: R.apps || {}, D, base: D.roster, roster: D.roster, selfs: [], couplings: R.couplings, units: R.units, prog: new Map(), dev: new Map(), since: 0, ukey: R.ukey_enc, now: R.now, k: null, showOld: false, tick: 0, shares: [] };
  try { const t = JSON.parse(sessionStorage.getItem('probe-tafel-' + cid) || 'null'); if (t && t.until > Date.now() && R.class.tafel_until) TAFEL.set(cid, t); } catch (er) { }
  await loadSelfs(H, P, R);
  await Promise.all([pull(H, P), loadShares(H, P)]); pubStats(H, P);
  draw(H, P);
  POLL = setInterval(async () => {
    if (location.hash !== `#/uk/${cid}`) { clearInterval(POLL); $('.u-board')?.remove(); return; }
    if (document.visibilityState !== 'visible' || $('.dlg')) return;
    try {
      const ch = await pull(H, P); if (!(++P.tick % 3)) loadShares(H, P); if (ch) pubStats(H, P);
      if ([...P.dev].some(([s, d]) => s[0] === 'T' && d.paired && !P.roster.some(r => r.sid === s))) { await reload(H, P); boardCount(P); } // neu über den Tafel-Code
      else if (ch) drawLive(H, P); else drawSeen(H, P);
    } catch (er) { }
  }, 5000);
}
/** über den Tafel-QR-Code selbst eingetragene: Namen entschlüsseln; genaue Treffer in der Namensliste ordnet Probe von selbst zu */
async function loadSelfs(H, P, R, auto = true) {
  const S = [], seen = new Set();
  for (const k of R.couplings) {
    if (!k.name_enc || k.sid[0] !== 'T' || seen.has(k.sid) || P.base.some(r => r.sid === k.sid)) continue; seen.add(k.sid);
    if (R.couplings.filter(x => x.sid === k.sid).every(x => +x.revoked)) continue; // abgemeldet
    try { const x = await H.K.open(H.S.priv, k.name_enc); S.push({ sid: k.sid, v: String(x?.v || '').trim().slice(0, 40), n: String(x?.n || '').trim().slice(0, 40), self: true, at: +k.paired || 0 }); } catch (er) { }
  }
  if (auto && S.length && P.base.length) {
    const { matchRoster } = await import('./names.js'), M = matchRoster(P.base, S.map((x, i) => ({ id: i, v: x.v, n: x.n })));
    const ex = [...M.byPerson].filter(([, m]) => m.exact);
    if (ex.length) {
      for (const [i, m] of ex) await H.api('ut_merge', { id: P.cid, from: S[i].sid, to: P.base[m.idx].sid });
      H.toast(ex.length === 1 ? `⇄ ${H.esc(S[ex[0][0]].v)} ${H.esc(S[ex[0][0]].n)} der Namensliste zugeordnet` : `⇄ ${ex.length} selbst eingetragene Namen der Namensliste zugeordnet`, 4000);
      const R2 = await H.api('ut_class', { id: P.cid }); Object.assign(P, { couplings: R2.couplings, units: R2.units, now: R2.now, c: R2.class });
      return loadSelfs(H, P, R2, false);
    }
  }
  S.sort((a, b) => `${a.n} ${a.v}`.localeCompare(`${b.n} ${b.v}`, 'de'));
  P.selfs = S; P.roster = [...P.base, ...S];
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
  const paired = P.roster.filter(r => P.dev.get(r.sid)?.paired).length, open = P.base.filter(r => !P.dev.get(r.sid)?.paired).length, T = tafelOn(P);
  main.innerHTML = `<a class="back" href="#/unterricht">‹ Unterricht</a>
    <h1>${esc(P.c.name)}${P.c.fach ? ' ' + esc(P.c.fach) : ''}</h1><p class="sub">Schuljahr ${esc(P.c.schuljahr)} · ${P.base.length} Schüler:innen${P.selfs.length ? ` · ${P.selfs.length} selbst eingetragen` : ''} · ${paired} gekoppelt <span class="c-lock">🔒 Namen und Stände nur für dich lesbar</span></p>
    <div class="bar"><button class="btn pri" id="uStart">＋ Lernpfad starten</button><button class="btn" id="uApps" title="Apps, die die Schüler dieser Klasse im PathFinder Player frei nutzen dürfen">🧩 Apps${(P.c.apps || []).length ? ` (${P.c.apps.length})` : ''}</button><button class="btn" id="uReq" title="Kopien zum Übernehmen und mit dir geteilte Projekte">📥 Anfragen${shareBadge(P)}</button><span class="sp"></span><span class="u-tafelbtn"><button class="btn" id="uTafel">▣ Tafel-QR-Code</button><button class="linkbtn" id="uWhat" aria-expanded="false">Was ist das?</button>
      <span class="u-tip" id="uTip" role="tooltip" hidden>Mit dem <b>Tafel-QR-Code</b> und der <b>PIN</b> kommen Schüler in die Klasse, die keinen persönlichen QR-Code bekommen haben – z. B. in der ersten Stunde, wenn noch keine Codes gedruckt sind. Sie scannen den Code an der Tafel, geben die PIN und ihren Namen ein und sind gekoppelt. Code und PIN gelten 15 Minuten. Die Namen ordnest du danach der Namensliste zu (gleiche Namen von selbst).</span></span>
      <button class="btn" id="uQr">▦ QR-Codes zum Koppeln${open ? ` (${open} offen)` : ''}</button></div>
    ${T ? `<div class="u-tafel-on">▣ Tafel-Code aktiv – noch <b data-tleft>${Math.max(1, Math.ceil((T.until - Date.now()) / 60000))} min</b>${T.pin ? ` · PIN <b>${esc(T.pin)}</b>` : ''}<span class="sp"></span>${T.pin ? '<button class="btn sm" data-tshow="1">Anzeigen</button>' : ''}<button class="btn sm ghost danger" data-tend="1">Beenden</button></div>` : ''}
    ${P.selfs.length ? `<div class="u-selfs">✎ <b>${P.selfs.length}</b> ${P.selfs.length === 1 ? 'Person hat sich' : 'Personen haben sich'} über den Tafel-QR-Code selbst eingetragen${P.base.length ? ' und ' + (P.selfs.length === 1 ? 'ist' : 'sind') + ' noch keinem Namen der Klasse zugeordnet' : ''}.<span class="sp"></span><button class="btn sm pri" id="uMerge">⇄ Namen zuordnen</button></div>` : ''}
    <div id="uRun">${runHtml(H, P, run)}</div>
    ${done.length ? `<section class="card"><h2>Beendete Einheiten</h2><div class="tiles">${done.slice(0, 3).map(u => unitTile(H, P, u)).join('')}</div>
      ${done.length > 3 ? `<details class="u-old"${P.showOld ? ' open' : ''}><summary>Ältere Unterrichtseinheiten (${done.length - 3})</summary><div class="tiles">${done.slice(3).map(u => unitTile(H, P, u)).join('')}</div></details>` : ''}</section>` : ''}
    ${P.units.length ? `<section class="card"><h2>Bearbeitungsstatistik</h2><div id="uStat">${statHtml(H, P)}</div></section>` : ''}
    <section class="card"><h2>Kopplung</h2><p class="help">Jede Schülerin, jeder Schüler scannt einmal den eigenen QR-Code – danach ist das iPad mit dieser Klasse gekoppelt (App „PathFinder Player“ auf dem Home-Bildschirm). Ein QR-Code gilt nur einmal; für ein neues oder zweites Gerät hier einen neuen erzeugen.</p>
      <div id="uCpl">${couplingHtml(H, P)}</div></section>`;
  $('#uStart').onclick = () => startDialog(H, P);
  $('#uApps').onclick = () => classApps(H, P);
  $('#uReq').onclick = () => sharesDialog(H, P);
  $('#uQr').onclick = () => qrDialog(H, P, P.base.filter(r => !P.dev.get(r.sid)?.paired).map(r => r.sid));
  $('#uTafel').onclick = () => tafelOn(P)?.pin ? showBoard(H, P) : openTafel(H, P);
  $('#uWhat').onclick = () => { const t = $('#uTip'), o = t.hidden; t.hidden = !o; $('#uWhat').setAttribute('aria-expanded', String(o)); };
  $('#uMerge') && ($('#uMerge').onclick = () => mergeDialog(H, P));
  main.onclick = ev => onClick(H, P, ev);
  const old = $('.u-old', main); if (old) old.ontoggle = () => { P.showOld = old.open; };
}
function runHtml(H, P, run) {
  const { esc } = H;
  if (!run.length) return '<section class="card"><p class="help" style="margin:0">Gerade läuft nichts. „＋ Lernpfad starten“ schickt einen Lernpfad an die Klasse – er erscheint auf den gekoppelten iPads von selbst.</p></section>';
  return run.map(u => `<section class="card u-live"><div class="bar"><h2 style="margin:0">▶ ${esc(u.title || 'ohne Titel')}</h2><span class="help">${esc(FORM[u.form] || '')} · seit ${new Date(u.started * 1000).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}${u.targets ? ` · für ${JSON.parse(u.targets).length} Schüler` : ''}</span><span class="sp"></span>
    <button class="btn sm" data-uend="${u.id}" title="Einheit beenden: Stand einfrieren, Abgaben einsammeln">■ Beenden</button></div>${liveTable(H, P, u)}</section>`).join('');
}
/** JPad-Einheit: wer arbeitet gerade, wie viel Code, letzter Programmlauf; 👁 Live-Ansicht */
function jpadTable(H, P, u, frozen) {
  const { esc } = H, M = P.prog.get(u.id) || new Map(), R = P.roster.filter(r => forSid(u, r.sid) || M.has(r.sid));
  const act = R.filter(r => P.now - (P.dev.get(r.sid)?.seen || 0) < 120).length, runs = [...M.values()].filter(x => x.run).length;
  const tm = t => t ? new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<p class="help" style="margin:6px 0">${frozen ? '' : `${act} gerade aktiv · `}${M.size} von ${R.length} haben Code geschrieben · ${runs} haben ihr Programm ausgeführt</p>
    <div class="scroll-x"><table class="t u-tab"><tr><th>Name</th>${frozen ? '' : '<th>zuletzt</th>'}<th>Code</th><th>letzter Lauf</th><th></th></tr>
    ${R.map(r => { const x = M.get(r.sid), seen = P.dev.get(r.sid)?.seen, out = x?.run ? String(x.run.output || '').trim().split('\n').slice(-6).join('\n') : '';
      return `<tr><td>${nameCell(esc, r)}</td>${frozen ? '' : `<td class="help${P.now - (seen || 0) < 120 ? ' u-on' : ''}">${P.dev.get(r.sid)?.paired ? esc(ago(P.now, seen)) : 'nicht gekoppelt'}</td>`}
        <td>${x?.sum ? `${x.sum.files} Datei${x.sum.files === 1 ? '' : 'en'} · ${x.sum.lines} Zeilen` : '<span class="help">noch nichts geändert</span>'}</td>
        <td>${x?.run ? `<span class="chip ${x.run.error ? 'warn' : 'good'}" title="${esc(out || '(keine Ausgabe)')}">${x.run.error ? '⚠ Fehler' : '▶ lief'}</span> <span class="help">${esc(tm(x.run.at))}</span>` : '<span class="help">–</span>'}</td>
        <td><button class="btn sm" data-uwatch="${u.id}|${esc(r.sid)}" title="Code live ansehen (die Schülerin, der Schüler sieht einen Hinweis)"${x || P.dev.get(r.sid)?.paired ? '' : ' disabled'}>👁 Ansehen</button></td></tr>`; }).join('')}</table></div>`;
}
/** Live-Ansicht des JPad-Codes einer Person: JPad schreibgeschützt, neuer Stand alle 3 Sekunden.
    ✎ Bearbeiten: das Gerät sperrt seinen Editor und bestätigt (ack) – erst dann ist der Code frei für die Lehrkraft; ↩ Zurückgeben
    schickt ihren Stand an das Gerät, ✕ Verwerfen gibt ohne Änderung frei. 💬 Kommentar: grüner Kreis an der Zeile beim Schüler. */
/* ---------- Apps der Klasse und Anfragen der Schüler (Kopien übernehmen, geteilte Projekte) ---------- */
const shareBadge = P => { const n = (P.shares || []).filter(s => s.status === 'offen').length; return n ? ` <span class="chip warn">${n}</span>` : ''; };
async function loadShares(H, P) {
  try { P.shares = (await H.api('ut_shares', { id: P.cid })).items; } catch (er) { P.shares = P.shares || []; }
  const b = $('#uReq'); if (b) b.innerHTML = '📥 Anfragen' + shareBadge(P);
}
async function classApps(H, P) {
  const { dialog, esc, toast, K } = H; let C; try { C = await PA.loadApps(H, true); } catch (er) { toast('⚠ ' + esc(er.message)); return; }
  const A = C.apps.filter(a => a.ready !== false && a.kind !== 'pfapp' && PA.allowed(C, a, P.c.fach)), on = new Set(P.c.apps || []);
  const d = dialog('🧩 Apps für ' + P.c.name, `<p class="help">Diese Apps sehen die Schüler der Klasse im PathFinder Player unter „Apps“ und können damit <b>eigene Projekte</b> anlegen. Die Projekte liegen nur auf ihren iPads; mit „📤 Mit Lehrkraft teilen“ schicken sie dir eines (unter „📥 Anfragen“). Während einer Prüfung in dieser Klasse sind die Apps gesperrt.</p>
    ${A.length ? `<div class="u-sel" style="max-height:none">${A.map(a => `<label><input type="checkbox" value="${esc(a.id)}"${on.has(a.id) ? ' checked' : ''}> ${esc(a.icon || '🧩')} <b>${esc(a.name)}</b> <span class="help">${esc(a.beschreibung || '')}</span></label>`).join('')}</div>` : '<p class="help">Für dieses Fach ist noch keine App freigegeben.</p>'}
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">Speichern</button></div>`);
  $('#go', d.el).onclick = async () => {
    const ids = $$('input:checked', d.el).map(x => x.value); $('#go', d.el).disabled = true;
    try {
      const ck = await classKey(H, P), docs = {};
      for (const id of ids) { const a = A.find(x => x.id === id); if (!a || (on.has(id) && a.kind === 'jpad')) continue;
        docs[id] = await K.sealExamDoc(ck, a.kind === 'jpad' ? { kind: 'jpad', name: 'JPad', icon: '☕' } : { kind: 'html', name: a.name, icon: a.icon, m: { ...a.m, lernpfad: undefined, lernpfadText: undefined }, html: a.html }); }
      P.c.apps = (await H.api('ut_class_apps', { id: P.cid, apps: ids, docs })).apps; d.close(); toast('✓ Apps gespeichert'); draw(H, P);
    } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
  };
}
async function sharesDialog(H, P) {
  const { dialog, esc, toast, K, S, api } = H; await loadShares(H, P);
  const L = P.shares || [], ck = await classKey(H, P), name = sid => { const r = P.roster.find(x => x.sid === sid); return r ? `${esc(r.n)}, ${esc(r.v)}` : '<span class="help">unbekannt</span>'; };
  const unitT = id => esc(P.units.find(u => u.id === +id)?.title || 'Einheit');
  const ST = { offen: '<span class="chip warn">offen</span>', uebernommen: '<span class="chip good">übernommen</span>', abgelehnt: '<span class="chip">abgelehnt</span>', gesehen: '<span class="chip">gesehen</span>', ersetzt: '<span class="chip">ersetzt</span>' };
  const rows = L.filter(s => s.status !== 'ersetzt');
  const d = dialog('📥 Anfragen und geteilte Projekte', `<p class="help"><b>Kopie</b>: Ein Schüler hat nach dem Ende einer Einheit (oder privat) weitergearbeitet und bittet dich, seine Kopie zu übernehmen – dann wird sie sein Stand in der Einheit (z. B. nachgereicht). <b>Geteilt</b>: ein eigenes App-Projekt zum Ansehen und Kommentieren.</p>
    ${rows.length ? `<div class="scroll-x"><table class="t"><tr><th>Name</th><th>Was</th><th>Wann</th><th>Status</th><th></th></tr>${rows.map(s => `<tr><td>${name(s.sid)}</td>
      <td>${s.kind === 'copy' ? `🟡 Kopie · ${unitT(s.unit_id)}` : `📤 ${esc(s.title || 'Projekt')}`} <span class="help">${esc(s.app || '')}</span><div class="help" data-sum="${s.id}"></div></td>
      <td class="help">${new Date(s.created * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${ST[s.status] || esc(s.status)}</td>
      <td class="nowrap"><button class="btn sm" data-sv="${s.id}">👁</button>${s.kind === 'copy' && s.status === 'offen' ? `<button class="btn sm pri" data-sok="${s.id}">Übernehmen</button><button class="btn sm" data-sno="${s.id}">Ablehnen</button>` : ''}<button class="btn sm" data-scm="${s.id}" title="Kommentar schreiben">💬</button></td></tr>`).join('')}</table></div>`
      : '<p class="help">Gerade keine Anfragen.</p>'}`, { wide: true });
  const data = new Map(), get = async s => { if (!data.has(s.id)) data.set(s.id, await K.open(S.priv, s.data_enc)); return data.get(s.id); };
  for (const s of rows) get(s).then(x => { const e = $(`[data-sum="${s.id}"]`, d.el); if (e) e.textContent = x.sum?.pct != null ? `Lernpfad ${x.sum.pct} %` : x.files ? `${x.files.length} Datei(en)` : x.summary?.text || x.app?.summary?.text || ''; }).catch(() => { });
  const comment = async (s, t) => { let list = []; try { if (s.reply_enc) list = (await K.openExamDoc(ck, s.reply_enc)).list || []; } catch (er) { } list.push({ t, at: Date.now() }); return K.sealExamDoc(ck, { list }); };
  const decide = async (s, op, t) => { await api('ut_share_decide', { share: s.id, op, ...(t ? { reply_enc: await comment(s, t) } : {}) }); };
  d.el.onclick = async ev => {
    const b = ev.target.closest('[data-sv],[data-sok],[data-sno],[data-scm]'); if (!b) return;
    const s = rows.find(x => x.id === +(b.dataset.sv || b.dataset.sok || b.dataset.sno || b.dataset.scm)); if (!s) return;
    try {
      if (b.dataset.sv) { d.close(); return viewShare(H, P, s, await get(s)); }
      if (b.dataset.sok) { if (!confirm('Diese Kopie als Stand in der Einheit übernehmen? Der bisherige Stand wird ersetzt.')) return; await decide(s, 'uebernehmen'); toast('✓ übernommen'); P.since = 0; await pull(H, P); }
      if (b.dataset.sno) { const t = prompt('Ablehnen – Kommentar für den Schüler (optional):', ''); if (t == null) return; await decide(s, 'ablehnen', t.trim()); toast('abgelehnt'); }
      if (b.dataset.scm) { const t = prompt('Kommentar für den Schüler:', ''); if (!t?.trim()) return; await decide(s, s.kind === 'share' ? 'gesehen' : 'kommentar', t.trim()); toast('💬 gesendet'); }
      d.close(); sharesDialog(H, P); draw(H, P);
    } catch (er) { toast('⚠ ' + esc(er.message), 5000); }
  };
}
/** Anfrage ansehen: JPad schreibgeschützt bzw. App mit dem Stand des Schülers */
async function viewShare(H, P, s, x) {
  const { api, esc, toast, K } = H, ck = await classKey(H, P), r = P.roster.find(y => y.sid === s.sid), who = r ? `${r.v} ${r.n}` : '';
  if (s.kind === 'share' && s.status === 'offen') api('ut_share_decide', { share: s.id, op: 'gesehen' }).then(() => loadShares(H, P)).catch(() => { });
  let doc = null; if (s.unit_id) try { doc = await K.openExamDoc(ck, (await api('ut_unit', { unit: +s.unit_id, op: 'doc' })).doc_enc); } catch (er) { }
  if (x.files) {
    const A = await import('../vendor/pathfinder/core/pfapp.js');
    A.openApp({ app: 'jpad', url: UAPPS.jpad, mode: 'unterricht', task: 's' + s.id, title: `👁 ${who} · ${s.title || ''}`, files: x.files, readonly: true, closeLabel: 'Schließen',
      extra: { ...(doc?.jcode ? { jcode: doc.jcode } : {}), ...(doc?.project ? { project: doc.project, projectKey: 's' + s.id } : {}) } });
    A.appStatus(s.kind === 'copy' ? 'Kopie des Schülers – nur ansehen' : 'geteiltes Projekt – nur ansehen'); return;
  }
  let html = doc?.app?.html || '';
  if (!html) { const C = await PA.loadApps(H), a = C.apps.find(y => y.id === s.app); html = a?.html || ''; }
  if (!html) { toast(x.sum ? `Lernpfad: ${x.sum.pct} % (${x.sum.solved}/${x.sum.total})` : 'Zu diesem Stand gibt es keine Ansicht.', 5000); return; }
  const st = x.app ? x.app : { state: x.state, summary: x.summary };
  PA.watchPapp(H, { title: `👁 ${who} · ${s.title || ''}`, html, get: () => ({ app: st, sum: x.sum, updated: Math.round((x.at || Date.now()) / 1000) }) });
}
async function watchJPad(H, P, uid, sid) {
  const { api, esc, toast, K } = H, u = P.units.find(x => x.id === uid), r = P.roster.find(x => x.sid === sid); if (!u || !r) return;
  let doc, E, ck; try { ck = await classKey(H, P); [doc, E] = await Promise.all([api('ut_unit', { unit: uid, op: 'doc' }).then(x => K.openExamDoc(ck, x.doc_enc)), api('ut_edit', { unit: uid, sid, op: 'state' })]); } catch (er) { toast('⚠ ' + esc(er.message)); return; }
  const A = await import('../vendor/pathfinder/core/pfapp.js');
  const cur = () => P.prog.get(uid)?.get(sid), live = u.status === 'laeuft';
  let comments = []; try { comments = E.comments_enc ? (await K.openExamDoc(ck, E.comments_enc)).list || [] : []; } catch (er) { }
  const S = { mode: E.lock ? 'edit' : 'watch', v: E.v, files: null, t: null, last: cur()?.updated || 0, iv: null, pings: 0, closed: false };
  if (E.lock && E.files_enc) try { S.files = (await K.openExamDoc(ck, E.files_enc)).files; } catch (er) { }
  const line = () => {
    if (S.mode === 'wait') return A.appStatus('⏳ warte, bis das iPad gesperrt ist …');
    if (S.mode === 'edit') return A.appStatus('✎ Du bearbeitest – das iPad ist gesperrt');
    const x = cur(); A.appStatus(x ? `zuletzt geändert ${new Date(x.updated * 1000).toLocaleTimeString('de-DE')}${x.run ? ` · letzter Lauf ${x.run.error ? '⚠ Fehler' : '▶ ok'}` : ''}` : 'noch nichts geändert');
  };
  const sendFiles = () => { clearTimeout(S.t); S.t = setTimeout(async () => { if (S.mode === 'edit' && S.files) try { await api('ut_edit', { unit: uid, sid, op: 'files', files_enc: await K.sealExamDoc(ck, { files: S.files }) }); } catch (er) { } }, 1500); };
  const buttons = () => {
    const bar = A.appBar(); if (!bar) return; let box = bar.querySelector('.u-jbtns');
    if (!box) { box = document.createElement('span'); box.className = 'u-jbtns'; bar.insertBefore(box, bar.querySelector('[data-close]')); box.onclick = onBtn; }
    box.innerHTML = !live ? `<button class="alt" data-j="cm">💬 Kommentare (${comments.length})</button>`
      : S.mode === 'edit' ? `<button class="alt" data-j="cm">💬 Kommentar${comments.length ? ` (${comments.length})` : ''}</button><button class="alt" data-j="cancel" title="Änderungen verwerfen, das iPad wieder freigeben">✕ Verwerfen</button><button data-j="release" title="Deinen Stand an das iPad geben und es wieder freigeben">↩ Zurückgeben</button>`
      : S.mode === 'wait' ? `<button class="alt" data-j="cancel">Abbrechen</button>`
      : `<button class="alt" data-j="cm">💬 Kommentar${comments.length ? ` (${comments.length})` : ''}</button><button class="alt" data-j="edit" title="Das iPad sperren und selbst im Code arbeiten">✎ Bearbeiten</button>`;
    line();
  };
  const toEdit = async () => { // Gerät hat gesperrt: neuesten Stand holen, dann frei für die Lehrkraft
    try { await pull(H, P); } catch (er) { }
    S.files = S.files || cur()?.files || null; if (S.files) A.updateApp(S.files);
    S.mode = 'edit'; A.setAppReadonly(false); buttons();
  };
  const backToWatch = () => { S.mode = 'watch'; S.files = null; A.setAppReadonly(true); const x = cur(); if (x?.files) A.updateApp(x.files); buttons(); };
  async function onBtn(ev) {
    const j = ev.target.closest('[data-j]')?.dataset.j; if (!j) return;
    try {
      if (j === 'edit') { const e = await api('ut_edit', { unit: uid, sid, op: 'lock' }); S.v = e.v; S.mode = 'wait'; S.since = Date.now(); buttons(); }
      else if (j === 'cancel') { await api('ut_edit', { unit: uid, sid, op: 'cancel' }); backToWatch(); toast('Das iPad ist wieder frei – ohne Änderungen.'); }
      else if (j === 'release') {
        await A.flushApp(800); clearTimeout(S.t);
        await api('ut_edit', { unit: uid, sid, op: 'release', files_enc: await K.sealExamDoc(ck, { files: S.files || [] }) });
        backToWatch(); toast(`↩ Zurückgegeben – ${esc(r.v)} arbeitet mit deinem Stand weiter.`, 4000);
      } else if (j === 'cm') commentBox();
    } catch (er) { toast('⚠ ' + esc(er.message)); }
  }
  const saveComments = async () => { await api('ut_edit', { unit: uid, sid, op: 'comments', comments_enc: comments.length ? await K.sealExamDoc(ck, { list: comments }) : null }); A.appComments(comments); buttons(); };
  async function commentBox() { // kleines Fenster über JPad: Kommentar zur Cursorzeile, Liste mit Löschen
    const c = await A.appCursor(), ov = document.querySelector('.pfapp-ov'); if (!ov) return;
    ov.querySelector('.u-cbox')?.remove();
    const box = document.createElement('div'); box.className = 'u-cbox';
    const draw = () => {
      box.innerHTML = `<div class="u-cin"><b>💬 Kommentare für ${esc(r.v)}</b>
        ${comments.length ? `<ul>${comments.map((x, i) => `<li><span class="help">${esc(x.file)}, Zeile ${x.line}</span> ${esc(x.text)} <button class="linkbtn" data-cdel="${i}">entfernen</button></li>`).join('')}</ul>` : ''}
        ${live && c?.file ? `<label>Neu zu <b>${esc(c.file)}, Zeile ${c.line}</b>${c.text?.trim() ? ` <code>${esc(c.text.trim().slice(0, 60))}</code>` : ''}<textarea id="ctext" rows="3" placeholder="z. B. Hier fehlt die Abbruchbedingung – wann endet die Schleife?"></textarea></label>
          <p class="help">Tipp: Erst in JPad in die Zeile tippen, dann auf „💬 Kommentar“.</p>` : live ? '<p class="help">Tippe in JPad in die Zeile, zu der der Kommentar gehört, und öffne dieses Fenster dann erneut.</p>' : ''}
        <div class="btns"><button class="btn" data-cx>Schließen</button>${live && c?.file ? '<button class="btn pri" data-cadd>Kommentar setzen</button>' : ''}</div></div>`;
    };
    draw(); ov.appendChild(box); box.querySelector('#ctext')?.focus();
    box.onclick = async e => {
      if (e.target === box || e.target.closest('[data-cx]')) { box.remove(); return; }
      const d = e.target.closest('[data-cdel]'); if (d) { comments.splice(+d.dataset.cdel, 1); try { await saveComments(); } catch (er) { toast('⚠ ' + esc(er.message)); } draw(); return; }
      if (e.target.closest('[data-cadd]')) {
        const t = box.querySelector('#ctext').value.trim(); if (!t) return;
        comments.push({ id: Math.random().toString(36).slice(2, 10), file: c.file, line: c.line, snip: String(c.text || '').trim().slice(0, 200), text: t.slice(0, 2000), at: Date.now() });
        try { await saveComments(); box.remove(); toast('💬 Kommentar gesetzt – erscheint gleich auf dem iPad.'); } catch (er) { comments.pop(); toast('⚠ ' + esc(er.message)); }
      }
    };
  }
  const stop = async () => {
    S.closed = true; clearInterval(S.iv); if (!live) return;
    if (S.mode === 'edit') { try { await api('ut_edit', { unit: uid, sid, op: 'release', files_enc: await K.sealExamDoc(ck, { files: S.files || [] }) }); toast('↩ Beim Schließen zurückgegeben – das iPad ist wieder frei.', 4000); } catch (er) { } }
    else if (S.mode === 'wait') api('ut_edit', { unit: uid, sid, op: 'cancel' }).catch(() => { });
    api('ut_watch', { id: P.cid, sid, off: 1 }).catch(() => { });
  };
  A.openApp({ app: 'jpad', url: P.apps.jpad, mode: 'unterricht', task: `w${uid}-${sid}`, title: `👁 ${r.v} ${r.n} · ${u.title || ''}`, files: S.files || cur()?.files || [], readonly: S.mode !== 'edit', closeLabel: 'Schließen',
    extra: { observe: S.mode !== 'edit', comments, ...(doc.jcode ? { jcode: doc.jcode } : {}), ...(doc.project ? { project: doc.project, projectKey: 'u' + uid } : {}) },
    onState: st => { if (S.mode !== 'edit') return; S.files = st.files; sendFiles(); }, onClose: stop });
  buttons();
  if (!live) return;
  api('ut_watch', { id: P.cid, sid }).catch(() => { });
  S.iv = setInterval(async () => {
    if (S.closed || !document.querySelector('.pfapp-ov:not([hidden])')) return;
    try {
      if (++S.pings % 4 === 0) api('ut_watch', { id: P.cid, sid }).catch(() => { });
      if (S.mode === 'wait') { const e = await api('ut_edit', { unit: uid, sid, op: 'state' }); if (e.ack >= S.v) await toEdit(); else if (Date.now() - S.since > 30000) A.appStatus('⏳ das iPad meldet sich nicht – ist es online? (Abbrechen gibt es wieder frei)'); return; }
      if (S.mode === 'edit') return;
      await pull(H, P);
    } catch (er) { return; }
    const x = cur(); if (x && x.updated !== S.last) { S.last = x.updated; if (x.files) A.updateApp(x.files); } line();
  }, 3000);
}
/** Live-Ansicht (Lernpfad, Challenge, Lernpfad + App): der Stand der Person, schreibgeschützt; läuft die Einheit, alle 2 s neu.
 *  Das Gerät zeigt solange „Deine Lehrkraft schaut zu“ und sendet schneller (ut_watch). */
const DOCC = new Map(); // entschlüsselte Einheiten (nur im Speicher)
async function watchApp(H, P, uid, sid) {
  const { api, esc, toast, K } = H, u = P.units.find(x => x.id === uid), r = P.roster.find(x => x.sid === sid); if (!u || !r) return;
  let doc = DOCC.get(uid); if (!doc) try { doc = await K.openExamDoc(await classKey(H, P), (await api('ut_unit', { unit: uid, op: 'doc' })).doc_enc); DOCC.set(uid, doc); } catch (er) { toast('⚠ ' + esc(er.message)); return; }
  const live = u.status === 'laeuft', ping = () => api('ut_watch', { id: P.cid, sid }).catch(() => { });
  if (live) ping();
  const iv = live ? setInterval(() => pull(H, P).catch(() => { }), 2000) : null, iw = live ? setInterval(ping, 15000) : null;
  const papp = u.form === 'papp', lp = papp ? doc.lernpfad : doc;
  // Kommentare wie bei JPad (uedit.comments_enc, Klassenschlüssel); „gelesen“ meldet das Gerät nicht – es zeigt den Punkt nur, bis die Person sie geöffnet hat
  const ck = await classKey(H, P), loadCm = async () => { try { const E = await api('ut_edit', { unit: uid, sid, op: 'state' }); return E.comments_enc ? (await K.openExamDoc(ck, E.comments_enc)).list || [] : []; } catch (er) { return []; } };
  PA.watchLive(H, { title: `👁 ${r.v} ${r.n} · ${papp ? (doc.app?.m?.icon || '🧩') + ' ' : ''}${u.title || ''}`, live, app: papp ? doc.app : null, lernpfad: lp,
    get: () => P.prog.get(uid)?.get(sid), comments: loadCm,
    onComment: live ? async c => { const L = await loadCm(); L.push({ id: Math.random().toString(36).slice(2, 10), ...c, at: Date.now() }); await api('ut_edit', { unit: uid, sid, op: 'comments', comments_enc: await K.sealExamDoc(ck, { list: L.slice(-50) }) }); } : null,
    onClose: () => { clearInterval(iv); clearInterval(iw); if (live) api('ut_watch', { id: P.cid, sid, off: 1 }).catch(() => { }); } });
}
/** Kennzahlen einer Einheit über alle, die begonnen haben: Ø und bester Fortschritt, Ø Bearbeitungszeit */
function agg(P, u) {
  const L = [...(P.prog.get(u.id) || new Map()).values()].filter(x => x.sum && typeof x.sum.pct === 'number'); if (!L.length) return null;
  const pc = L.map(x => x.sum.pct), mi = L.map(x => x.sum.mins || 0);
  return { avg: Math.round(pc.reduce((a, b) => a + b, 0) / L.length), max: Math.max(...pc), n: L.length, mins: Math.round(mi.reduce((a, b) => a + b, 0) / L.length) };
}
/** Fortschrittsleiste wie in der Statusleiste der Schüler: eigener Stand, Strich für Ø, Strich für den/die Beste */
const pbar = (pct, A) => `<span class="u-pbar" title="${pct} %${A ? ` · Ø ${A.avg} % · Beste:r ${A.max} %` : ''}"><i style="width:${pct}%"></i>${A && A.n >= 2 ? `<b class="avg" style="left:${A.avg}%"></b><b class="best" style="left:${A.max}%"></b>` : ''}</span>`;
/** Zeile pastellrot bzw. pastellgrün: mehr als 20 % hinter bzw. vor dem Ø (relativ, erst ab Ø 10 % und 3 Personen) */
const rowCls = (A, pct) => !A || A.n < 3 || A.avg < 10 ? '' : pct < A.avg * .8 ? ' class="u-slow"' : pct > A.avg * 1.2 ? ' class="u-fast"' : '';
/** Bearbeitungszeit relativ zum Ø: +12 % = länger als der Durchschnitt */
const tdev = (mins, A) => { if (!A || A.n < 2 || A.mins < 1) return ''; const d = Math.round((mins / A.mins - 1) * 100); return ` <span class="u-dt" title="Bearbeitungszeit im Vergleich zum Ø der Klasse">${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} %</span>`; };
/** Kennzahlen für die Leiste der Schüler veröffentlichen (nur Zahlen, ohne Personenbezug), wenn sie sich geändert haben */
async function pubStats(H, P) {
  P.pub = P.pub || {};
  for (const u of P.units.filter(u => u.status === 'laeuft' && u.form !== 'jpad')) {
    const A = agg(P, u); if (!A) continue; const k = `${A.avg}/${A.max}/${A.n}`; if (P.pub[u.id] === k) continue;
    try { await H.api('ut_stats', { unit: u.id, avg: A.avg, max: A.max, n: A.n }); P.pub[u.id] = k; } catch (er) { }
  }
}
function liveTable(H, P, u, frozen = false) {
  if (u.form === 'jpad') return jpadTable(H, P, u, frozen);
  const { esc } = H, M = P.prog.get(u.id) || new Map(), R = P.roster.filter(r => forSid(u, r.sid) || M.has(r.sid));
  const st = [...M.values()].find(x => x.sum?.st)?.sum.st || [];
  const sub = [...M.values()].filter(x => x.submitted).length, act = R.filter(r => P.now - (P.dev.get(r.sid)?.seen || 0) < 120).length, A = agg(P, u);
  return `<p class="help" style="margin:6px 0">${frozen ? '' : `${act} gerade aktiv · `}${M.size} von ${R.length} haben begonnen · ${sub} abgegeben${A ? ` · Ø Fortschritt <b>${A.avg} %</b> · Beste:r ${A.max} % · Ø Zeit ${A.mins} min` : ''}</p>
    ${A ? `<p class="help u-leg"><span class="u-pbar"><i style="width:60%"></i><b class="avg" style="left:45%"></b><b class="best" style="left:85%"></b></span> eigener Stand · <span class="u-tick avg"></span> Ø der Klasse · <span class="u-tick best"></span> Beste:r (so sehen es die Schüler, anonym) · <span class="u-key slow"></span> mehr als 20 % hinter dem Ø · <span class="u-key fast"></span> mehr als 20 % vor dem Ø</p>` : ''}
    <div class="scroll-x"><table class="t u-tab"><tr><th>Name</th>${frozen ? '' : '<th>zuletzt</th>'}<th>Fortschritt</th>${u.form === 'papp' ? '<th>App</th>' : ''}${st.map((s, i) => `<th class="u-st" title="${esc(s.t)}">${i + 1}</th>`).join('')}<th title="geöffnete Tipps">Tipps</th><th title="aktive Bearbeitungszeit">Zeit</th><th>Abgabe</th></tr>
    ${R.map(r => { const x = M.get(r.sid), s = x?.sum, seen = P.dev.get(r.sid)?.seen;
      return `<tr${s ? rowCls(A, s.pct) : ''}><td>${nameCell(esc, r)} <button class="btn sm ghost u-eye" data-pwatch="${u.id}|${esc(r.sid)}" title="${frozen ? 'Stand ansehen' : 'Live ansehen: Lernpfad' + (u.form === 'papp' ? ' und App' : '') + ' so, wie die Person ihn gerade sieht'}"${x ? '' : ' disabled'}>👁</button></td>${frozen ? '' : `<td class="help${P.now - (seen || 0) < 120 ? ' u-on' : ''}">${P.dev.get(r.sid)?.paired ? esc(ago(P.now, seen)) : '<span title="noch nicht gekoppelt">nicht gekoppelt</span>'}</td>`}
        <td class="nowrap">${s ? `${pbar(s.pct, A)} ${s.pct} %${s.total ? ` <span class="help">(${s.solved}/${s.total})</span>` : ''}` : '<span class="help">nicht begonnen</span>'}</td>
        ${u.form === 'papp' ? `<td class="help" title="meldet die App selbst">${x?.app?.summary ? esc(x.app.summary.text || x.app.summary.pct + ' %') : ''}</td>` : ''}
        ${st.map(t => { const y = s?.st?.find(z => z.id === t.id); return `<td class="u-st ${!y ? '' : y.of ? (y.n === y.of ? 'ok' : y.n ? 'half' : y.v ? 'seen' : '') : y.v ? 'ok' : ''}" title="${esc(t.t)}${y ? `: ${y.of ? `${y.n}/${y.of} gelöst` : y.v ? 'angesehen' : ''}${y.tips ? `, ${y.tips} Tipp${y.tips === 1 ? '' : 's'}` : ''}${y.sols ? `, ${y.sols} Lösung${y.sols === 1 ? '' : 'en'}` : ''}` : ''}">${y ? (y.of ? (y.n === y.of ? '✓' : y.n ? `${y.n}/${y.of}` : y.v ? '·' : '') : y.v ? '✓' : '') : ''}</td>`; }).join('')}
        <td>${s ? s.st.reduce((a, z) => a + (z.tips || 0), 0) || '' : ''}</td><td class="help nowrap">${s ? `${s.mins} min${tdev(s.mins, A)}` : ''}</td><td>${x?.submitted ? `<span class="chip good" title="${esc(new Date(x.submitted * 1000).toLocaleString('de-DE'))}">✓</span>` : ''}</td></tr>`; }).join('')}</table></div>`;
}
function drawLive(H, P) { const el = $('#uRun'); if (el) el.innerHTML = runHtml(H, P, P.units.filter(u => u.status === 'laeuft')); const s = $('#uStat'); if (s) s.innerHTML = statHtml(H, P); const c = $('#uCpl'); if (c) c.innerHTML = couplingHtml(H, P); }
function drawSeen(H, P) { drawLive(H, P); }
function unitTile(H, P, u) {
  if (u.form === 'jpad') { const M = P.prog.get(u.id) || new Map(), esc = H.esc;
    return `<button type="button" class="tile" data-uopen="${u.id}"><span class="k">${esc(FORM.jpad)}</span><span class="t">${esc(u.title || 'ohne Titel')}</span>
      <span class="m">${new Date(u.started * 1000).toLocaleDateString('de-DE')} – ${u.ended ? new Date(u.ended * 1000).toLocaleDateString('de-DE') : ''}</span><span class="s"><span class="chip">${M.size} mit Code</span><span class="chip">${[...M.values()].filter(x => x.run).length} ausgeführt</span></span></button>`; }
  const { esc } = H, M = P.prog.get(u.id) || new Map(), n = P.roster.filter(r => forSid(u, r.sid)).length || M.size, pct = M.size ? Math.round([...M.values()].reduce((a, x) => a + (x.sum?.pct || 0), 0) / Math.max(n, 1)) : 0;
  return `<button type="button" class="tile" data-uopen="${u.id}"><span class="k">${esc(FORM[u.form] || 'Lernpfad')}</span><span class="t">${esc(u.title || 'ohne Titel')}</span>
    <span class="m">${new Date(u.started * 1000).toLocaleDateString('de-DE')} – ${u.ended ? new Date(u.ended * 1000).toLocaleDateString('de-DE') : ''}</span><span class="s"><span class="chip">Ø ${pct} %</span><span class="chip">${[...M.values()].filter(x => x.submitted).length} Abgaben</span></span></button>`;
}
/** Ø der Abweichungen der Bearbeitungszeit vom Klassen-Ø über alle Einheiten einer Person */
function zeitDev(P, U, r) {
  const d = U.filter(u => u.form !== 'jpad' && forSid(u, r.sid)).map(u => { const x = P.prog.get(u.id)?.get(r.sid), A = agg(P, u); return x?.sum && A && A.n >= 2 && A.mins >= 1 ? (x.sum.mins || 0) / A.mins - 1 : null; }).filter(x => x != null);
  if (!d.length) return ''; const m = Math.round(100 * d.reduce((a, b) => a + b, 0) / d.length);
  return ` <span class="u-dt" title="Bearbeitungszeit im Schnitt im Vergleich zum Ø der Klasse">⏱ ${m > 0 ? '+' : m < 0 ? '−' : '±'}${Math.abs(m)} %</span>`;
}
function statHtml(H, P) {
  const { esc } = H, U = P.units.slice().reverse();
  return `<div class="scroll-x"><table class="t u-tab"><tr><th>Name</th>${U.map(u => `<th class="k-ex" title="${esc(u.title)}">${esc((u.title || '–').slice(0, 14))}${(u.title || '').length > 14 ? '…' : ''}<br><span class="help">${new Date(u.started * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}</span></th>`).join('')}<th>Ø</th></tr>
    ${P.roster.map(r => { const v = U.filter(u => u.form !== 'jpad' && forSid(u, r.sid)).map(u => P.prog.get(u.id)?.get(r.sid)?.sum?.pct ?? 0);
      return `<tr><td>${nameCell(esc, r)}</td>${U.map(u => { if (!forSid(u, r.sid)) return '<td class="help">–</td>'; const x = P.prog.get(u.id)?.get(r.sid);
        if (u.form !== 'jpad' && x?.sum) { const A = agg(P, u); return `<td class="nowrap${rowCls(A, x.sum.pct) ? ' ' + rowCls(A, x.sum.pct).slice(8, -1) : ''}">${x.sum.pct} %${x.submitted ? ' ✓' : ''}${tdev(x.sum.mins || 0, A)}</td>`; }
        if (u.form === 'jpad') return `<td>${x ? (x.run ? (x.run.error ? '<span title="letzter Lauf mit Fehler">⚠</span>' : '<span title="Programm ausgeführt">▶</span>') : '<span title="Code geschrieben">✎</span>') : '<span class="help">–</span>'}</td>`; return `<td>${x ? `${x.sum?.pct ?? 0} %${x.submitted ? ' ✓' : ''}` : '<span class="help">0 %</span>'}</td>`; }).join('')}<td class="nowrap"><b>${v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) + ' %' : ''}</b>${zeitDev(P, U, r)}</td></tr>`; }).join('')}</table></div>
    <p class="help">Prozent = gelöste Aufgaben des Lernpfads (ohne Aufgaben: angesehene Stationen) · +/− % = Bearbeitungszeit im Vergleich zum Ø der Klasse (+ = länger) · rot/grün = mehr als 20 % hinter bzw. vor dem Ø-Fortschritt · ✓ abgegeben · – nicht für diese Person gestartet${P.units.some(u => u.form === 'jpad') ? ' · JPad: ✎ Code geschrieben, ▶ ausgeführt, ⚠ letzter Lauf mit Fehler' : ''}. Das ist keine Note.</p>`;
}
function couplingHtml(H, P) {
  const { esc } = H;
  const st = r => { const C = P.couplings.filter(k => k.sid === r.sid), d = P.dev.get(r.sid);
    if (C.some(k => +k.revoked) && !d?.paired) return '<span class="chip warn">abgemeldet</span>';
    if (d?.paired) return `<span class="chip good">gekoppelt</span> <span class="help">${esc(ago(P.now, d.seen))}</span>`;
    if (C.some(k => +k.open)) return '<span class="chip">QR-Code erstellt, noch nicht gescannt</span>';
    return '<span class="help">nicht gekoppelt</span>'; };
  return `<div class="scroll-x"><table class="t"><tr><th>Name</th><th>Status</th><th></th></tr>${P.roster.map(r => `<tr><td>${nameCell(esc, r)}</td><td>${st(r)}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-uqr="${esc(r.sid)}" title="Neuen QR-Code erzeugen (z. B. für ein neues oder zweites Gerät)">▦ Neuer QR-Code</button>${P.dev.get(r.sid)?.paired ? ` <button class="btn sm ghost danger" data-urev="${esc(r.sid)}" title="Alle Geräte dieser Person abmelden">Abmelden</button>` : ''}</td></tr>`).join('')}</table></div>`;
}
async function onClick(H, P, ev) {
  if (!ev.target.closest('#uWhat,#uTip') && $('#uTip') && !$('#uTip').hidden) { $('#uTip').hidden = true; $('#uWhat').setAttribute('aria-expanded', 'false'); }
  const { api, esc, toast, dialog } = H, b = ev.target.closest('[data-uend],[data-uqr],[data-urev],[data-uopen],[data-tshow],[data-tend],[data-uwatch],[data-pwatch]'); if (!b) return;
  if (b.dataset.uwatch) { const [uid, sid] = b.dataset.uwatch.split('|'); return watchJPad(H, P, +uid, sid); }
  if (b.dataset.pwatch) { const [uid, sid] = b.dataset.pwatch.split('|'); return watchApp(H, P, +uid, sid); }
  if (b.dataset.tshow) return showBoard(H, P);
  if (b.dataset.tend) return endTafel(H, P);
  if (b.dataset.uend && confirm(P.units.find(x => x.id === +b.dataset.uend)?.form === 'jpad' ? 'Einheit beenden? Der Stand wird für dich eingefroren (wieder öffnen ist möglich). Die Schüler können ihr Projekt danach ansehen oder als eigenes Projekt in JPad weiterbauen – das siehst du dann nicht mehr.' : 'Einheit beenden? Der Stand wird eingefroren, die Schüler können nicht mehr weiterarbeiten (wieder öffnen ist möglich).')) { await api('ut_unit', { unit: +b.dataset.uend, op: 'end' }); return reload(H, P); }
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
async function reload(H, P) { const R = await H.api('ut_class', { id: P.cid }); Object.assign(P, { couplings: R.couplings, units: R.units, now: R.now, c: R.class }); if (!R.class.tafel_until) TAFEL.delete(P.cid); await loadSelfs(H, P, R); await pull(H, P); draw(H, P); }

/* ---------- Tafel-QR-Code: gemeinsamer Code mit PIN (15 Minuten) für Schüler ohne persönlichen QR-Code ---------- */
function tafelOn(P) {
  const t = TAFEL.get(P.cid); if (t && t.until > Date.now()) return t;
  if (t) { TAFEL.delete(P.cid); sessionStorage.removeItem('probe-tafel-' + P.cid); }
  return P.c.tafel_until && P.c.tafel_until > P.now ? { until: Date.now() + (P.c.tafel_until - P.now) * 1000 } : null; // auf einem anderen Gerät geöffnet: PIN unbekannt
}
async function openTafel(H, P) {
  try {
    const s = b64u(crypto.getRandomValues(new Uint8Array(16))), pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
    const r = await H.api('ut_tafel', { id: P.cid, hash: await sha256hex(s), pin_hash: await sha256hex(s + '|' + pin) });
    const t = { s, pin, until: Date.now() + (r.until - r.now) * 1000, from: r.now }; TAFEL.set(P.cid, t);
    try { sessionStorage.setItem('probe-tafel-' + P.cid, JSON.stringify(t)); } catch (er) { }
    P.c.tafel_until = r.until; P.now = r.now; await classKey(H, P); draw(H, P); showBoard(H, P);
  } catch (er) { H.toast('⚠ ' + H.esc(er.message)); }
}
async function endTafel(H, P) {
  try { await H.api('ut_tafel', { id: P.cid, op: 'end' }); } catch (er) { H.toast('⚠ ' + H.esc(er.message)); return; }
  TAFEL.delete(P.cid); sessionStorage.removeItem('probe-tafel-' + P.cid); P.c.tafel_until = null; $('.u-board')?.remove(); draw(H, P); H.toast('Tafel-Code beendet');
}
function boardCount(P) {
  const el = $('.u-board [data-tn]'), t = TAFEL.get(P.cid); if (!el || !t) return;
  const n = P.couplings.filter(k => k.sid[0] === 'T' && +k.paired >= (t.from || 0)).length;
  el.textContent = n ? `${n} ${n === 1 ? 'hat' : 'haben'} sich eingetragen` : '';
}
/** Vollbild für Beamer oder Tafel: großer QR-Code, PIN, Restzeit */
async function showBoard(H, P) {
  const { esc } = H, t = tafelOn(P); if (!t?.pin) return;
  const link = `${new URL('play.html', location.href).href.replace(/[?#].*$/, '')}#t=${P.cid}.${t.s}.${await classKey(H, P)}`;
  $('.u-board')?.remove();
  const el = document.createElement('div'); el.className = 'u-board'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Tafel-QR-Code');
  el.innerHTML = `<div class="ub-top"><b>${esc(P.c.name)}${P.c.fach ? ' · ' + esc(P.c.fach) : ''}</b> · PathFinder Player<span class="sp"></span><button class="btn" data-bclose>Schließen</button><button class="btn ghost danger" data-bend>Tafel-Code beenden</button></div>
    <div class="ub-main"><div class="ub-qr">${qrSvg(link, { title: 'Tafel-QR-Code' })}</div>
      <div class="ub-side"><div class="ub-l">PIN</div><div class="ub-pin">${esc(t.pin)}</div>
        <ol><li>QR-Code mit der Kamera scannen</li><li>PIN eingeben</li><li>Vor- und Nachnamen eintragen</li></ol>
        <div class="ub-left" data-bleft></div><div class="ub-n" data-tn></div></div></div>`;
  document.body.appendChild(el); boardCount(P);
  const tick = () => { const ms = t.until - Date.now(), x = $('[data-bleft]', el); if (!x) { clearInterval(iv); return; }
    if (ms <= 0) { clearInterval(iv); x.innerHTML = 'abgelaufen – <button class="btn pri" data-bnew>Neuer Tafel-Code</button>'; $('.ub-qr', el).classList.add('off'); $('.ub-pin', el).classList.add('off'); return; }
    x.textContent = `gilt noch ${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} min`; const m = $('[data-tleft]'); if (m) m.textContent = `${Math.max(1, Math.ceil(ms / 60000))} min`; };
  const iv = setInterval(tick, 1000); tick();
  const close = () => { clearInterval(iv); el.remove(); removeEventListener('keydown', key); draw(H, P); };
  const key = e => { if (e.key === 'Escape') close(); }; addEventListener('keydown', key);
  el.onclick = async e => {
    if (e.target.closest('[data-bclose]')) close();
    if (e.target.closest('[data-bend]')) { clearInterval(iv); removeEventListener('keydown', key); await endTafel(H, P); }
    if (e.target.closest('[data-bnew]')) { clearInterval(iv); removeEventListener('keydown', key); el.remove(); openTafel(H, P); }
  };
}
/** selbst eingetragene Namen der Namensliste zuordnen (Vorschläge wie bei den Prüfungen) oder in die Namensliste aufnehmen */
async function mergeDialog(H, P) {
  const { dialog, esc, api, K, S, toast, withBusy } = H, { matchRoster } = await import('./names.js');
  const L = P.selfs, M = matchRoster(P.base, L.map((x, i) => ({ id: i, v: x.v, n: x.n })));
  const pre = i => { const m = M.byPerson.get(i); return m ? P.base[m.idx].sid : P.base.length ? '' : '+'; };
  const d = dialog('⇄ Namen zuordnen', `<p class="help">Links, was die Schüler selbst eingetippt haben; rechts der Name in der Klasse. Fortschritt und Abgaben wandern mit. Gelb = ähnlicher Name, bitte prüfen.</p>
    <div class="m-list">${L.map((x, i) => { const m = M.byPerson.get(i), v = pre(i); return `<label class="m-row${m ? ' fuzzy' : ''}"><span><b>${esc(x.n)}</b>, ${esc(x.v)}${x.at ? ` <small class="help">${new Date(x.at * 1000).toLocaleDateString('de-DE')}</small>` : ''}${m ? '<br><span class="chip warn">ähnlicher Name – bitte prüfen</span>' : ''}</span>
      <select data-i="${i}"><option value=""${v === '' ? ' selected' : ''}>– später zuordnen –</option><option value="+"${v === '+' ? ' selected' : ''}>＋ in die Namensliste aufnehmen</option>
      ${P.base.length ? `<optgroup label="Namensliste">${P.base.map(r => `<option value="${esc(r.sid)}"${r.sid === v ? ' selected' : ''}>${esc(r.n)}, ${esc(r.v)}</option>`).join('')}</optgroup>` : ''}</select></label>`; }).join('')}</div>
    <div class="err" id="err"></div><button class="btn pri" id="go">Zuordnung speichern</button>`, { wide: true });
  $('#go', d.el).onclick = async () => {
    const sel = $$('select[data-i]', d.el).map(s => [L[+s.dataset.i], s.value]).filter(([, v]) => v);
    if (!sel.length) { d.close(); return; }
    $('#go', d.el).disabled = true;
    try {
      await withBusy('wird zugeordnet …', async () => {
        const add = sel.filter(([, v]) => v === '+').map(([x]) => ({ sid: x.sid, v: x.v, n: x.n }));
        if (add.length) { // erst die Namensliste (für dich verschlüsselt), dann die Kopplungen
          const c = P.D.c, roster = [...P.base, ...add].sort((a, b) => `${a.n} ${a.v}`.localeCompare(`${b.n} ${b.v}`, 'de'));
          await api('cl_save', { id: c.id, name: c.name, fach_id: c.fach_id || 0, gewicht: c.gewicht, roster_enc: await K.seal(S.keys.pub_key, roster), roster_n: roster.length });
          P.base = P.D.roster = roster;
        }
        for (const [x, v] of sel) await api('ut_merge', { id: P.cid, from: x.sid, to: v === '+' ? x.sid : v });
      });
      d.close(); toast(`✓ ${sel.length} ${sel.length === 1 ? 'Name' : 'Namen'} zugeordnet`); reload(H, P);
    } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
  };
}

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
  let L; try { L = (await api('lp_list')).items.filter(x => x.form !== 'app'); } catch (er) { toast('⚠ ' + esc(er.message)); return; }
  if (!L.length) { toast('Noch keine Lernpfade – lege unter „Unterricht“ → „Meine Lernpfade“ einen an.', 6000); return; }
  // passende zuerst: gleiches Fach und gleiche Jahrgangsstufe wie die Klasse
  const jg = jgOf(P.c.name), fit2 = x => (x.meta?.fach && P.c.fach && x.meta.fach.toLowerCase() === P.c.fach.toLowerCase() ? 2 : 0) + (jg && +x.meta?.jg === jg ? 1 : 0);
  const best = L.filter(x => fit2(x) === 3), rest = L.filter(x => fit2(x) !== 3).sort((a, b) => fit2(b) - fit2(a));
  const opt = x => `<option value="${x.id}">${esc(x.title || 'ohne Titel')} (${esc(FORM[x.form] || 'Lernpfad')}${x.meta ? ' · ' + esc(metaLine(x.meta)) : ''})</option>`;
  const d = dialog('＋ Lernpfad starten', `<label class="f">Lernpfad<select id="lp">${best.length ? `<optgroup label="Passend für ${esc(P.c.name)}${P.c.fach ? ' ' + esc(P.c.fach) : ''}">${best.map(opt).join('')}</optgroup><optgroup label="Weitere">${rest.map(opt).join('')}</optgroup>` : L.map(opt).join('')}</select></label>
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
        const k = await classKey(H, P), base = new URL('play.html', location.href).href.replace(/[?#].*$/, ''), items = [], cards = [];
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
    pdf.text(fit(`${P.c.name}${P.c.fach ? ' · ' + P.c.fach : ''} · PathFinder Player`, 10.5, false, W - 24), x0 + 12, y, 10.5, { col: '#555555' }); y += 12;
    const QM = qrMatrix(link), c = Q / QM.length, qx = x0 + (W - Q) / 2, qy = y + 4;
    pdf.color('#000000');
    QM.forEach((row, yy) => { let s0 = -1; for (let xx = 0; xx <= row.length; xx++) { const on = xx < row.length && row[xx]; if (on && s0 < 0) s0 = xx; if (!on && s0 >= 0) { pdf.ops.push(`${(qx + s0 * c).toFixed(2)} ${(PAGE_H - qy - (yy + 1) * c).toFixed(2)} ${((xx - s0) * c).toFixed(2)} ${c.toFixed(2)} re f`); s0 = -1; } } });
    y = qy + Q + 16;
    for (const l of wrap('1. Mit der Kamera scannen und den Link öffnen. 2. In Safari: Teilen → „Zum Home-Bildschirm“. 3. Ab jetzt über das Symbol „PathFinder“ starten. Der Code gilt nur einmal.', 8.5, false, W - 24)) { pdf.text(l, x0 + 12, y, 8.5, { col: '#555555' }); y += 11; }
  });
  return pdf.bytes();
}
