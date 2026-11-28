// PathFinder Player – Seite der Schüler (play.html, am besten als Symbol auf dem Home-Bildschirm).
// Einmal den QR-Code der Lehrkraft scannen: play.html#u=<Klasse>.<Geheimnis>.<Klassenschlüssel>.<Name> → das Gerät wird mit der Klasse
// gekoppelt (Geräteschlüssel). Der Teil hinter „#“ geht nie an den Server. Danach zeigt die Seite je Klasse eine Kachel; in der Klasse:
//   🟢 laufende Einheiten (der Stand geht verschlüsselt an die Lehrkraft), 🔴 beendete (nur ansehen),
//   🟡 private Kopien (die Lehrkraft sieht Änderungen nicht – „An Lehrkraft schicken“ bittet sie, die Kopie zu übernehmen),
//   Apps, die die Lehrkraft für die Klasse freigegeben hat (eigene Projekte nur auf dem iPad, „Mit Lehrkraft teilen“).
import { startPathFinder } from '../vendor/pathfinder/core/pathfinder.js';
import * as K from './crypto.js';
import { openScanner } from './qrscan.js';

const $ = s => document.querySelector(s), home = $('#home');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
async function api(a, data = {}) {
  let r, j;
  try { r = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, ...data }), cache: 'no-store' }); }
  catch (e) { const er = new Error('Keine Verbindung'); er.offline = true; throw er; }
  try { j = await r.json(); } catch (e) { const er = new Error('Server antwortet nicht'); er.offline = true; throw er; }
  if (!j.ok) { const er = new Error(j.error || 'Fehler'); er.status = r.status; throw er; }
  return j;
}

/* ---------- Speicher im Gerät (IndexedDB) ---------- */
// k = Kopplungen (je Klasse) · u = eigener Stand in Einheiten, Schlüssel „Klasse:Einheit“ · p = private Kopien und eigene App-Projekte
const DB = () => new Promise((res, rej) => {
  const q = indexedDB.open('probe-unterricht', 3);
  q.onupgradeneeded = () => { const d = q.result; for (const [n, kp] of [['k', 'c'], ['u', 'id'], ['p', 'id']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: kp }); };
  q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
});
async function store(mode, fn, name = 'k') { const db = await DB(); return new Promise((res, rej) => { const t = db.transaction(name, mode), s = t.objectStore(name), q = fn(s); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); }
const allK = () => store('readonly', s => s.getAll()), putK = k => store('readwrite', s => s.put(k)), delK = c => store('readwrite', s => s.delete(c));
const getU = id => store('readonly', s => s.get(id), 'u'), putU = x => store('readwrite', s => s.put(x), 'u');
const allP = () => store('readonly', s => s.getAll(), 'p'), putP = x => store('readwrite', s => s.put(x), 'p'), delP = id => store('readwrite', s => s.delete(id), 'p');
try { navigator.storage?.persist?.(); } catch (e) { }
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
/** Prüfsumme über den Inhalt – ohne Werte, die sich von selbst ändern (Bearbeitungszeit) */
const stable = d => { const x = clone(d) || {}; if (x.prog) { delete x.prog.active; delete x.prog.start; delete x.prog.here; } if (x.sum) delete x.sum.mins; delete x.at; return x; };
async function hashOf(x) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(x)))); return Array.from(new Uint8Array(b).slice(0, 12), v => v.toString(16).padStart(2, '0')).join(''); }
/** Projekt sichern (mit Prüfsumme: so sieht das Gerät, ob sich seit dem Schicken etwas geändert hat) */
async function saveP(p) { p.updated = Date.now(); p.hash = await hashOf(p.data); await putP(p); }

/* ---------- Übergabe Safari → Symbol auf dem Home-Bildschirm ----------
   iOS gibt dem Symbol einen eigenen, leeren Speicher. Deshalb trägt die Seite in Safari hinter „#“ (geht nie an den Server) je Kopplung
   ein Übergabe-Geheimnis ein (eine Stunde gültig, bei jedem Laden neu); das Symbol merkt sich diese Adresse und übernimmt beim ersten Start
   die Kopplung (ut_take: neuer Geräteschlüssel, der von Safari gilt danach nicht mehr). */
const b64e = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
let MOVE = '';
const here = () => location.pathname + MOVE;
async function prepMove() {
  if (standalone) return; const L = [];
  for (const k of await allK()) try { const r = await api('ut_move', { token: k.token }); L.push({ c: k.c, s: r.secret, k: k.k, v: k.v, n: k.n }); } catch (er) { }
  MOVE = L.length ? '#m=' + b64e(L) : ''; history.replaceState(history.state, '', here());
}
async function takeMove() {
  const m = location.hash.match(/^#m=([A-Za-z0-9_-]+)$/); history.replaceState(null, '', location.pathname); if (!m || !standalone) return '';
  let L; try { L = b64d(m[1]); } catch (e) { return ''; }
  const have = await allK(); let ok = 0, err = '';
  for (const x of Array.isArray(L) ? L : []) {
    if (!/^\d+$/.test(String(x.c)) || !/^[A-Za-z0-9_-]{22}$/.test(x.s || '') || !/^[A-Za-z0-9_-]{22}$/.test(x.k || '') || have.some(h => h.c === +x.c)) continue;
    try { const r = await api('ut_take', { class: +x.c, secret: x.s }); await putK({ c: +x.c, token: r.token, k: x.k, v: String(x.v || '').slice(0, 40), n: String(x.n || '').slice(0, 40), at: Date.now() }); ok++; }
    catch (er) { err = er.message; }
  }
  if (ok) return `<div class="u-hint">✓ Übernommen – ${ok === 1 ? 'deine Klasse ist' : 'deine Klassen sind'} jetzt hier im Player.</div>`;
  return err && !(await allK()).length ? `<div class="u-hint u-err">${esc(err)}</div>` : '';
}

/* ---------- QR-Code im Player scannen (Web-Clip aus dem MDM: Koppeln ohne Umweg über Safari) ---------- */
function scan() {
  openScanner({ title: 'QR-Code scannen', hint: 'Halte den QR-Code deiner Lehrkraft (oder den Tafel-QR-Code) in den Rahmen.', onText: t => {
    let u; try { u = new URL(t); } catch (e) { alert('Das ist kein QR-Code von Probe.'); return true; }
    if (!/^#[ut]=/.test(u.hash) || !/\/(play|l)\.html$/.test(u.pathname)) { alert('Das ist kein QR-Code zum Koppeln.'); return true; }
    if (u.origin !== location.origin) { alert(`Dieser QR-Code gehört zu einer anderen Probe (${u.host}). Öffne ihn bitte dort.`); return true; }
    history.replaceState(null, '', location.pathname + u.hash); location.reload(); return true;
  } });
}

/* ---------- QR-Code einlösen ---------- */
async function pairFromHash() {
  const m = location.hash.match(/^#u=(\d+)\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})\.(.*)$/); if (!m) return null;
  history.replaceState(null, '', location.pathname); // Geheimnis sofort aus der Adresse entfernen
  const [, c, s, k, nm] = m; let [v, n] = ['', '']; try { [v, n = ''] = decodeURIComponent(nm).split('|'); } catch (e) { }
  try { const r = await api('ut_pair', { class: +c, secret: s }); await putK({ c: +c, token: r.token, k, v, n, at: Date.now() }); return { ok: true, v }; }
  catch (er) { return { error: er.message }; }
}

/* ---------- Tafel-QR-Code: play.html#t=<Klasse>.<Geheimnis>.<Klassenschlüssel> – mit PIN und eigenem Namen eintragen ---------- */
async function joinFromHash() {
  const m = location.hash.match(/^#t=(\d+)\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/); if (!m) return false;
  history.replaceState(null, '', location.pathname);
  const [, c, s, k] = m, have = (await allK()).find(x => x.c === +c);
  if (have) return `<div class="u-hint">Dieses iPad ist mit dieser Klasse schon gekoppelt${have.v ? ` (${esc(have.v)} ${esc(have.n)})` : ''}.</div>`;
  let I; try { I = await api('ut_tafel_info', { class: +c, secret: s }); } catch (er) { return `<div class="u-hint u-err">${esc(er.message)}</div>`; }
  home.innerHTML = `${TITLE}
    <form class="u-cl u-join" id="join" autocomplete="off"><h2>${esc(I.class.name)}${I.class.fach ? ' · ' + esc(I.class.fach) : ''}</h2><div class="help">Lehrkraft ${esc(I.teacher)}</div>
      <label>PIN von der Tafel<input id="jPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" required autofocus></label>
      <label>Vorname<input id="jV" maxlength="40" required autocapitalize="words"></label>
      <label>Nachname<input id="jN" maxlength="40" required autocapitalize="words"></label>
      <p class="u-err" id="jErr"></p><button class="btn" id="jGo">Eintragen</button>
      <p class="help">Dein Name geht verschlüsselt an deine Lehrkraft – nur sie kann ihn lesen.</p></form>`;
  return new Promise(res => {
    $('#join').onsubmit = async ev => {
      ev.preventDefault(); const pin = $('#jPin').value.trim(), v = $('#jV').value.trim(), n = $('#jN').value.trim();
      if (!/^\d{4,6}$/.test(pin) || !v || !n) { $('#jErr').textContent = 'Bitte PIN, Vor- und Nachnamen eintragen.'; return; }
      $('#jGo').disabled = true; $('#jErr').textContent = '';
      try {
        const r = await api('ut_join', { class: +c, secret: s, pin, name_enc: await K.seal(I.pub_key, { v, n }) });
        await putK({ c: +c, token: r.token, k, v, n, at: Date.now() });
        res(`<div class="u-hint">✓ Eingetragen – hallo ${esc(v)}!</div>`);
      } catch (er) { $('#jErr').textContent = er.message; $('#jGo').disabled = false; if (er.status === 403 && /gilt nicht mehr/.test(er.message)) $('#jGo').hidden = true; }
    };
  });
}

/* ---------- Übersicht: Kacheln je Klasse, darin Einheiten, Apps und eigene Projekte ---------- */
const TITLE = '<h1><img src="app/pf-icon.svg" alt="">PathFinder Player</h1>';
const ICON = { lernpfad: '📘', challenge: '⚡', jpad: '☕', papp: '🧩' };
let KL = [], INFO = new Map(), DOCS = new Map(), APPD = new Map(), PL = [], REPLY = new Map(), NOTE = new Map(), homeT = null, VIEW = { c: null };
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const LEGEND = '<p class="u-legend">🟢 läuft – deine Lehrkraft sieht deinen Stand · 🔴 beendet – nur ansehen · 🟡 private Kopie – deine Lehrkraft sieht deine Änderungen nicht</p>';
async function drawHome(msg = '') {
  KL = await allK(); PL = await allP().catch(() => []);
  const k = VIEW.c != null && KL.find(x => x.c === VIEW.c);
  if (k) return drawClass(k, msg);
  home.innerHTML = `${TITLE}${msg}
    ${!KL.length ? `<div class="u-cl"><h2>Noch nicht gekoppelt</h2><p>Scanne den QR-Code, den du von deiner Lehrkraft bekommen hast (oder den Tafel-QR-Code).</p><button class="btn u-scan" data-scan>▦ QR-Code scannen</button></div>` : ''}
    ${MOVE ? INSTALL : ''}
    <div class="u-tiles">${KL.map(k => { const I = INFO.get(k.c), run = I?.units?.length || 0, cp = PL.filter(p => p.c === k.c && p.kind === 'copy').length;
      return `<button class="u-tile" data-class="${k.c}"><span class="u-tk">${I?.class?.fach ? esc(I.class.fach) : 'Klasse'}</span><b>${I?.class ? esc(I.class.name) : '…'}${I?.class?.fach ? ' ' + esc(I.class.fach) : ''}</b>
        <span class="help">${I?.teacher ? 'Lehrkraft ' + esc(I.teacher) : esc(k.v + ' ' + k.n)}</span>
        <span class="u-dots">${I?.error ? `<span class="u-err">⚠ ${esc(I.error)}</span>` : `${run ? `<span>🟢 ${run} läuft</span>` : ''}${cp ? `<span>🟡 ${cp}</span>` : ''}${I?.exam ? '<span>🔒 Prüfung</span>' : ''}${NOTE.get(k.c) ? '<span>✓ Neu</span>' : ''}`}</span></button>`; }).join('')}</div>
    ${KL.length ? '<button class="btn alt u-scan" data-scan>▦ Weitere Klasse: QR-Code scannen</button>' : ''}
    <p class="help" style="margin-top:24px">Deine Lehrkraft sieht nur, wie weit du in den gestarteten Einheiten bist – verschlüsselt, nur für sie lesbar.</p>`;
}
const INSTALL = '<div class="u-hint u-inst">📲 <b>Wichtig:</b> Tippe jetzt in Safari auf <b>Teilen</b> → <b>„Zum Home-Bildschirm“</b> und öffne den Player danach nur noch über das Symbol <b>PathFinder</b>. Deine Kopplung wird dabei übernommen (innerhalb einer Stunde).</div>';
function drawClass(k, msg = '') {
  const I = INFO.get(k.c) || {}, run = I.units || [], ended = I.ended || [], P = PL.filter(p => p.c === k.c).sort((a, b) => b.updated - a.updated);
  const apps = [...APPD.entries()].filter(([key]) => key.startsWith(k.c + ':')).map(([, a]) => a);
  home.innerHTML = `<button class="u-back" data-home>‹ Klassen</button>${msg}${MOVE ? INSTALL : ''}
    <h1>${I.class ? esc(I.class.name) + (I.class.fach ? ' · ' + esc(I.class.fach) : '') : 'Klasse'}</h1>
    <div class="help">${esc(k.v)} ${esc(k.n)}${I.teacher ? ` · Lehrkraft ${esc(I.teacher)}` : ''}</div>
    ${NOTE.get(k.c) ? `<div class="u-hint">${NOTE.get(k.c)}</div>` : ''}
    ${I.error ? `<p class="u-err">${esc(I.error)}</p>${I.gone ? `<button class="btn alt" data-forget="${k.c}">Kopplung entfernen</button>` : ''}` : ''}
    <div class="u-cl"><h2>Jetzt im Unterricht</h2>
      ${I.units ? (run.length ? run.map(u => `<button class="u-un" data-open="${k.c}:${u.id}:live"><span class="u-st">🟢</span><span class="u-ic">${ICON[u.form] || '📘'}</span><b>${esc(u.title || 'Lernpfad')}</b>${u.submitted ? '<span class="ok">✓ abgegeben</span>' : ''}</button>`).join('') : '<p class="help">Gerade ist nichts gestartet.</p>') : '<p class="help">wird geladen …</p>'}</div>
    ${I.exam ? '<div class="u-cl"><h2>Apps</h2><p class="help">🔒 Während einer Prüfung in dieser Klasse sind die Apps und deine Projekte gesperrt.</p></div>'
      : apps.length ? `<div class="u-cl"><h2>Apps</h2><div class="u-apps">${apps.map(a => `<button class="u-app" data-newp="${k.c}:${esc(a.id)}"><span class="u-ai">${esc(a.icon || '🧩')}</span><b>${esc(a.name)}</b><span class="help">＋ neues Projekt</span></button>`).join('')}</div></div>` : ''}
    ${P.length ? `<div class="u-cl"><h2>Meine Projekte</h2>${P.map(p => projRow(k, I, p)).join('')}<p class="help">Liegen nur auf diesem iPad. Mit 📤 schickst du ein Projekt an deine Lehrkraft.</p></div>` : ''}
    ${ended.length ? `<div class="u-cl"><h2>Beendet</h2>${ended.slice(0, 6).map(u => endedBtn(k, u)).join('')}
      ${ended.length > 6 ? `<details class="u-old"><summary>Ältere (${ended.length - 6})</summary>${ended.slice(6).map(u => endedBtn(k, u)).join('')}</details>` : ''}</div>` : ''}
    ${LEGEND}`;
}
const endedBtn = (k, u) => `<button class="u-un u-ended" data-open="${k.c}:${u.id}:ro"><span class="u-st">🔴</span><span class="u-ic">${ICON[u.form] || '📘'}</span><b>${esc(u.title || 'Lernpfad')}</b><span class="help">beendet ${new Date(u.ended * 1000).toLocaleDateString('de-DE')}</span></button>`;
/** neueste Anfrage zu einem Projekt und was sie bedeutet */
function shareOf(I, p) { return (I.shares || []).filter(s => s.local_id === p.id && s.status !== 'ersetzt').sort((a, b) => b.id - a.id)[0] || null; }
function projRow(k, I, p) {
  const s = shareOf(I, p), changed = s && s.hash !== p.hash, cm = s ? REPLY.get(+s.id) || [] : [], lock = I.exam && p.kind !== 'copy';
  const what = p.kind === 'copy' ? '🟡' : esc(APPD.get(`${k.c}:${p.app}`)?.icon || (p.app === 'jpad' ? '☕' : '🧩'));
  const st = !s ? (p.kind === 'copy' ? 'private Kopie – deine Lehrkraft sieht Änderungen nicht' : 'nur auf diesem iPad')
    : s.status === 'offen' ? `⏳ ${p.kind === 'copy' ? 'an die Lehrkraft geschickt' : 'mit der Lehrkraft geteilt'}${changed ? ' · seitdem geändert' : ''}`
    : s.status === 'uebernommen' ? '✓ Lehrkraft hat eine frühere Fassung übernommen'
    : s.status === 'abgelehnt' ? '✗ Lehrkraft hat abgelehnt' : `👁 Lehrkraft hat es angesehen${changed ? ' · seitdem geändert' : ''}`;
  return `<div class="u-pr"><button class="u-un" data-p="${esc(p.id)}"${lock ? ' disabled' : ''}><span class="u-st">${what}</span><b>${esc(p.title)}</b><span class="help">${esc(st)}</span></button>
    <span class="u-pb"><button class="alt" data-psend="${esc(p.id)}" title="${p.kind === 'copy' ? 'An Lehrkraft schicken (bitte übernehmen)' : 'Mit Lehrkraft teilen'}"${lock || (s && !changed && s.status === 'offen') ? ' disabled' : ''}>📤</button><button class="alt" data-pdel="${esc(p.id)}" title="Löschen">🗑</button></span>
    ${cm.length ? `<div class="u-cm">${cm.map(c => `<div>💬 ${esc(c.t)}</div>`).join('')}</div>` : ''}</div>`;
}
async function pollAll() {
  PL = await allP().catch(() => []);
  for (const k of await allK()) {
    try {
      const have = [...DOCS.keys()].filter(x => x.startsWith(k.c + ':')).map(x => +x.split(':')[1]);
      const haveApps = [...APPD.entries()].filter(([x]) => x.startsWith(k.c + ':')).map(([, a]) => `${a.id}:${a.v}`);
      const r = await api('ut_poll', { token: k.token, have, have_apps: haveApps });
      for (const u of [...r.units, ...(r.ended || [])]) if (u.doc_enc) DOCS.set(`${k.c}:${u.id}`, { enc: u.doc_enc });
      // freigegebene Apps (mit dem Klassenschlüssel verschlüsselt); bei laufender Prüfung liefert der Server keine
      const ids = new Set((r.capps || []).map(a => a.id));
      for (const key of [...APPD.keys()]) if (key.startsWith(k.c + ':') && !ids.has(key.split(':')[1])) APPD.delete(key);
      for (const a of r.capps || []) if (a.doc_enc) try { APPD.set(`${k.c}:${a.id}`, { ...(await K.openExamDoc(k.k, a.doc_enc)), id: a.id, v: a.v }); } catch (er) { }
      for (const s of r.shares || []) if (s.reply_enc && !REPLY.has(+s.id)) try { REPLY.set(+s.id, (await K.openExamDoc(k.k, s.reply_enc)).list || []); } catch (er) { }
      INFO.set(k.c, r);
      await mergeTaken(k, r);
    } catch (er) { if (!er.offline) INFO.set(k.c, { error: er.message, gone: er.status === 401, units: [] }); }
  }
}
/** Lehrkraft hat eine Kopie übernommen: ist sie seitdem unverändert, wird sie der eigene Stand der Einheit (grün bzw. rot), die Kopie verschwindet */
async function mergeTaken(k, r) {
  for (const s of r.shares || []) {
    if (s.kind !== 'copy' || s.status !== 'uebernommen') continue;
    const p = PL.find(x => x.id === s.local_id && x.c === k.c); if (!p || p.hash !== s.hash) continue;
    const key = `${k.c}:${p.unit}`, old = await getU(key).catch(() => null);
    await putU({ ...(old || {}), ...clone(p.data), id: key }); await delP(p.id); PL = PL.filter(x => x.id !== p.id);
    if (p.form !== 'jpad' && p.form !== 'papp') { const d = DOCS.get(key); if (d?.id) try { localStorage.removeItem('pathfinder.fortschritt.' + d.id); } catch (e) { } }
    NOTE.set(k.c, `✓ Deine Lehrkraft hat deine Kopie von „${esc(p.title.replace(/^Kopie: /, ''))}“ übernommen – sie ist jetzt dein Stand in der Einheit.`);
  }
}
home.onclick = async ev => {
  const t = ev.target.closest('[data-class],[data-home],[data-open],[data-forget],[data-p],[data-psend],[data-pdel],[data-newp],[data-scan]'); if (!t) return;
  const D = t.dataset;
  if (D.scan != null) { scan(); return; }
  if (D.class) { VIEW.c = +D.class; history.pushState({ c: VIEW.c }, '', here()); drawHome(); scrollTo(0, 0); return; }
  if (D.home != null) { history.back(); return; }
  if (D.forget && confirm('Diese Kopplung von diesem Gerät entfernen?')) { await delK(+D.forget); INFO.delete(+D.forget); VIEW.c = null; drawHome(); return; }
  if (D.open) { const [c, id, mode] = D.open.split(':'); openUnit(+c, +id, mode); return; }
  if (D.p) { openProject(D.p); return; }
  if (D.psend) { const p = PL.find(x => x.id === D.psend); if (p) sendProject(p); return; }
  if (D.pdel) { const p = PL.find(x => x.id === D.pdel); if (p && confirm(`„${p.title}“ von diesem iPad löschen?${p.kind === 'copy' ? ' Dein Stand in der Einheit bleibt.' : ''}`)) { await delP(p.id); drawHome(); } return; }
  if (D.newp) { const [c, app] = D.newp.split(':'); newProject(+c, app); }
};
addEventListener('popstate', () => { if (cur || J || !$('#app').hidden) { location.reload(); return; } VIEW.c = history.state?.c ?? null; drawHome(); });
/** nach dem Neuladen (z. B. „Private Kopie“) gleich das Richtige öffnen bzw. in die Klasse zurück */
const goNext = x => { try { sessionStorage.setItem('pfp-next', JSON.stringify(x)); } catch (e) { } location.hash = ''; location.reload(); };
const backHome = () => goNext({ c: VIEW.c ?? cur?.k?.c ?? J?.k?.c ?? null });

/* ---------- Einheit öffnen: live (grün), nur ansehen (rot) oder private Kopie (gelb) ---------- */
let cur = null, sendT = null, last = null, dirty = false, sending = false;
async function unitCtx(c, id) {
  const k = KL.find(x => x.c === c), I = INFO.get(c), u = I?.units?.find(x => x.id === id) || I?.ended?.find(x => x.id === id), D = DOCS.get(`${c}:${id}`);
  if (!k || !u || !D) return null;
  try { if (!D.doc) { D.doc = await K.openExamDoc(k.k, D.enc); D.id = D.doc.id; } } catch (er) { alert('Die Einheit lässt sich mit deiner Kopplung nicht öffnen. Bitte deine Lehrkraft um einen neuen QR-Code.'); return null; }
  return { k, I, u, doc: D.doc };
}
async function openUnit(c, id, mode = 'live') {
  const x = await unitCtx(c, id); if (!x) return; const { k, I, u, doc } = x;
  if (mode === 'live' && !I.units.some(y => y.id === id)) mode = 'ro';
  if (u.form === 'jpad') return mode === 'live' ? openJPad(k, u, doc, I) : openEnded(k, u, doc, I);
  const key = `${c}:${id}`, U = await getU(key).catch(() => null);
  if (u.form === 'papp') return openPapp({ k, I, u, doc, mode, data: U || {}, key });
  openLp({ k, I, u, doc, mode, data: U || {}, key });
}
/** Kopfleiste für Lernpfad und Lernpfad + App */
function bar(title, mode, extra = '') {
  clearInterval(homeT); home.hidden = true; $('#app').hidden = false; $('#sbar').hidden = false;
  $('#sbT').textContent = title; $('#sbSt').textContent = { live: '🟢', ro: '🔴 nur ansehen', copy: '🟡 private Kopie', own: '' }[mode] || '';
  $('#sbSt').title = { live: 'läuft – deine Lehrkraft sieht deinen Stand', ro: 'beendet – nur ansehen', copy: 'deine Lehrkraft sieht deine Änderungen nicht' }[mode] || '';
  $('#sbX').innerHTML = extra; $('#sbSub').hidden = mode !== 'live';
  history.pushState({ u: 1 }, '', here());
}
$('#sbX').onclick = ev => { const b = ev.target.closest('[data-x]'); if (b) X[b.dataset.x]?.(); };
const X = {}; // Aktionen der Kopfleiste (je nach Ansicht belegt)
/** Daten der Ansicht: live → an die Lehrkraft (gebündelt) und ins Gerät; Kopie → nur ins Gerät */
function sink(o) {
  return data => {
    if (o.mode === 'live') { if (data?.sum && typeof data.sum.pct === 'number') { MYP = data.sum.pct; drawP(); } last = data; dirty = true; putU({ ...clone(data), id: o.key }).catch(() => { }); clearTimeout(sendT); sendT = setTimeout(() => send(false), WATCH ? 800 : 3000); label('…'); }
    else if (o.mode === 'copy') { o.p.data = clone(data); saveP(o.p).catch(() => { }); label('✓ auf dem iPad'); }
  };
}
function actions(o) {
  X.copy = () => makeCopy(o);
  X.send = () => sendProject(o.p);
  return o.mode === 'ro' ? '<button data-x="copy" title="Eigene Kopie zum Weiterarbeiten – deine Lehrkraft sieht sie nicht, du kannst sie ihr aber schicken">✎<span class="t"> Private Kopie</span></button>'
    : o.mode === 'copy' ? `<button data-x="send" title="${o.p.kind === 'copy' ? 'Deine Lehrkraft bitten, diese Kopie zu übernehmen' : 'Mit Lehrkraft teilen'}">📤<span class="t"> ${o.p.kind === 'copy' ? 'An Lehrkraft schicken' : 'Mit Lehrkraft teilen'}</span></button>` : '';
}
/* Lebenszeichen alle 8 s: merkt, wenn die Lehrkraft die Einheit beendet, zuschaut (Hinweis, schneller senden) oder kommentiert */
let WATCH = false, PF = null, CM = { cupd: null, list: [], key: '' }, MYP = null, STATS = null;
/** Leiste in der Kopfleiste: eigener Fortschritt, Strich für den Ø der Klasse, goldener Strich für den/die Beste (anonym, ab 3 Personen) */
function drawP() {
  const el = $('#sbP'); if (MYP == null) { el.hidden = true; return; } el.hidden = false;
  el.querySelector('i').style.width = MYP + '%';
  const [a, b] = el.querySelectorAll('b'); a.hidden = b.hidden = !STATS;
  if (STATS) { a.style.left = STATS.avg + '%'; b.style.left = STATS.max + '%'; }
  el.querySelector('.sb-pt').innerHTML = `${MYP} %${STATS ? `<span class="x"> · <i>Ø ${STATS.avg} %</i> · <b>🏆 ${STATS.max} %</b></span>` : ''}`;
  el.title = `Dein Fortschritt: ${MYP} %${STATS ? ` · Durchschnitt der Klasse: ${STATS.avg} % · am weitesten: ${STATS.max} % (anonym)` : ''}`;
}
function liveCheck(o) {
  if (o.mode !== 'live') return;
  cur = { k: o.k, u: o.u, pub: o.I.pub_key }; CM.key = 'pfp.kommentar.gelesen.' + o.k.c + ':' + o.u.id;
  setWatch(!!o.I.watch); if (o.u.edit) applyCm(o.k, o.u.edit);
  STATS = o.u.stats || null; if (MYP == null) MYP = typeof o.data?.sum?.pct === 'number' ? o.data.sum.pct : 0; drawP();
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || !cur) return;
    try {
      const r = await api('ut_poll', { token: o.k.token, have: [o.u.id] }), uu = r.units.find(x => x.id === o.u.id);
      if (!uu) { setWatch(false); ended(); return; }
      setWatch(!!r.watch); if (uu.edit) applyCm(o.k, uu.edit); STATS = uu.stats || null; drawP();
    } catch (er) { if (er.status === 401) ended(er.message); }
  }, 8000);
}
function setWatch(on) { WATCH = on; $('#sbW').hidden = !on; if (on && dirty) { clearTimeout(sendT); sendT = setTimeout(() => send(false), 300); } }
/** Kommentare der Lehrkraft (mit dem Klassenschlüssel verschlüsselt): grüner Punkt blinkt, bis sie geöffnet wurden */
const seenCm = () => { try { return new Set(JSON.parse(localStorage.getItem(CM.key) || '[]')); } catch (e) { return new Set(); } };
async function applyCm(k, e) {
  if (e.cupd === CM.cupd) return; CM.cupd = e.cupd;
  try { CM.list = e.comments_enc ? (await K.openExamDoc(k.k, e.comments_enc)).list || [] : []; } catch (er) { CM.list = []; }
  drawCm();
  if (CM.list.some(c => !seenCm().has(c.id)) && navigator.vibrate) try { navigator.vibrate(60); } catch (er) { }
}
function drawCm() {
  const b = $('#sbC'), S = seenCm(), n = CM.list.filter(c => !S.has(c.id)).length;
  b.hidden = !CM.list.length; b.classList.toggle('blink', n > 0); b.title = n ? `${n} neue${n === 1 ? 'r' : ''} Kommentar${n === 1 ? '' : 'e'} deiner Lehrkraft` : 'Kommentare deiner Lehrkraft';
}
$('#sbC').onclick = () => {
  const box = document.createElement('div'); box.className = 'u-endbox u-cmpop'; const S = seenCm();
  box.innerHTML = `<div class="u-endin"><h2>💬 Kommentare deiner Lehrkraft</h2>${[...CM.list].reverse().map(c => `<div class="u-cmi${S.has(c.id) ? '' : ' neu'}"><div>${esc(c.t)}</div>
      <div class="help">${new Date(c.at).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${c.st ? ` · <button class="linkbtn" data-go="${esc(c.st)}">→ ${esc(c.stt || 'zur Station')}</button>` : ''}</div></div>`).join('')}
    <div class="u-endbtns"><button data-e="ok">OK</button></div></div>`;
  document.body.appendChild(box);
  try { localStorage.setItem(CM.key, JSON.stringify(CM.list.map(c => c.id))); } catch (e) { } drawCm();
  box.onclick = ev => { const g = ev.target.closest('[data-go]'); if (g) { PF?.goStation(g.dataset.go); box.remove(); return; } if (ev.target === box || ev.target.closest('[data-e]')) box.remove(); };
};
function openLp(o) {
  const { u, doc, mode } = o, data = mode === 'copy' ? o.p.data || {} : o.data, d = mode === 'copy' ? { ...doc, id: doc.id + '~' + o.p.id } : doc;
  bar(mode === 'copy' ? o.p.title : u.title || 'Lernpfad', mode, actions(o)); $('#sbSub').hidden = mode !== 'live' || !!u.submitted;
  PF = startPathFinder({ player: true, doc: d, storage: 'probe-u', appName: 'Probe', logo: 'app/icon.svg', readonly: mode === 'ro', ...(data.prog ? { progress: data.prog } : {}),
    host: { onProgress: (sum, prog) => sink(o)({ sum, prog }) } });
  liveCheck(o);
}
/** Lernpfad + App: links die App, rechts der Lernpfad; Ereignisse der App lösen App-Aufgaben */
async function openPapp(o) {
  const { u, doc, mode } = o, PP = await import('../vendor/pathfinder/core/pfpapp.js');
  const data = clone(mode === 'copy' ? o.p.data || {} : o.data) || {}, m = doc.app?.m || {};
  bar(mode === 'copy' ? o.p.title : u.title || m.name || 'App', mode, actions(o)); $('#sbSub').hidden = mode !== 'live' || !!u.submitted;
  const A = $('#app'); A.classList.add('u-split'); const left = document.createElement('div'); left.className = 'u-papp'; A.prepend(left);
  const push = sink(o), ah = PP.createAppHost({ events: m.events || [], name: m.name || 'App' });
  PP.mountApp(left, { html: doc.app?.html || '', state: data.app?.state ?? null, readonly: mode === 'ro',
    onState: (state, summary) => { data.app = { state, summary }; push(clone(data)); }, onEvent: n => ah.event(n), onError: msg => console.warn('App:', msg) });
  if (doc.lernpfad) {
    const lp = { ...doc.lernpfad, id: (doc.id || 'u') + '.lp' + (mode === 'copy' ? '~' + o.p.id : '') };
    PF = startPathFinder({ player: true, doc: lp, plugins: [PP.pappPlugin], storage: 'probe-u', appName: 'Probe', logo: 'app/icon.svg', readonly: mode === 'ro', ...(data.prog ? { progress: data.prog } : {}),
      host: Object.assign(ah, { onProgress: (sum, prog) => { data.sum = sum; data.prog = prog; push(clone(data)); } }) });
  } else A.classList.add('u-only');
  liveCheck(o);
}
/** beendete Einheit → private Kopie (gelb) mit dem eigenen Stand; danach gleich öffnen */
async function makeCopy(o) {
  const data = o.form === 'jpad' ? { files: o.files || [], run: null } : clone(o.data) || {};
  const p = { id: 'k' + rid(), c: o.k.c, kind: 'copy', unit: o.u.id, form: o.u.form, title: 'Kopie: ' + (o.u.title || 'Lernpfad'), data, created: Date.now() };
  await saveP(p);
  alert('✎ Private Kopie angelegt. Sie liegt nur auf diesem iPad – deine Lehrkraft sieht deine Änderungen nicht.\n\nMit „📤 An Lehrkraft schicken“ kannst du sie bitten, die Kopie zu übernehmen (z. B. zum Nachreichen).');
  goNext({ c: o.k.c, p: p.id });
}
/** Projekt (Kopie oder eigenes App-Projekt) öffnen */
async function openProject(id) {
  const p = (await allP()).find(x => x.id === id); if (!p) return;
  const k = KL.find(x => x.c === p.c), I = INFO.get(p.c); if (!k || !I) return;
  if (p.kind === 'copy') {
    const x = await unitCtx(p.c, p.unit); if (!x) { alert('Die Einheit zu dieser Kopie gibt es nicht mehr. Du kannst die Kopie löschen.'); return; }
    const o = { k, I, u: x.u, doc: x.doc, mode: 'copy', p, key: `${p.c}:${p.unit}` };
    if (p.form === 'jpad') return openJCopy(o); if (p.form === 'papp') return openPapp(o); return openLp(o);
  }
  if (I.exam) { alert('🔒 Während einer Prüfung sind die Apps gesperrt.'); return; }
  const a = APPD.get(`${p.c}:${p.app}`); if (!a) { alert('Deine Lehrkraft hat diese App für die Klasse gerade nicht freigegeben.'); return; }
  const o = { k, I, mode: 'copy', p, a };
  if (a.kind === 'jpad') return openJCopy(o);
  const PP = await import('../vendor/pathfinder/core/pfpapp.js');
  bar(p.title, 'own', actions(o)); $('#app').classList.add('u-split', 'u-only');
  const left = document.createElement('div'); left.className = 'u-papp'; $('#app').prepend(left);
  PP.mountApp(left, { html: a.html || '', state: p.data?.state ?? null, onState: (state, summary) => { p.data = { state, summary }; saveP(p).catch(() => { }); label('✓ auf dem iPad'); } });
}
async function newProject(c, appId) {
  const a = APPD.get(`${c}:${appId}`); if (!a) return;
  const n = PL.filter(p => p.c === c && p.app === appId).length + 1, title = prompt(`Name für dein ${a.name}-Projekt:`, `${a.name} ${n}`); if (title == null) return;
  const p = { id: 'p' + rid(), c, kind: 'own', app: appId, title: title.trim().slice(0, 80) || `${a.name} ${n}`, data: a.kind === 'jpad' ? { files: [] } : { state: null }, created: Date.now() };
  await saveP(p); openProject(p.id);
}
/** an die Lehrkraft: Kopie (bitte übernehmen) bzw. eigenes Projekt (teilen) – verschlüsselt, nur für sie lesbar */
async function sendProject(p) {
  p = (await allP()).find(x => x.id === p.id) || p;
  const k = KL.find(x => x.c === p.c), I = INFO.get(p.c); if (!k || !I?.pub_key) { alert('Keine Verbindung zur Klasse – bitte später noch einmal.'); return; }
  const copy = p.kind === 'copy';
  if (!confirm(copy ? `„${p.title}“ an deine Lehrkraft schicken?\n\nSie kann die Kopie übernehmen – dann zählt sie als dein Stand in der Einheit.` : `„${p.title}“ mit deiner Lehrkraft teilen? Sie sieht das Projekt so, wie es jetzt ist, und kann dir einen Kommentar schreiben.`)) return;
  const d = clone(p.data) || {};
  if (copy && p.form === 'jpad') d.sum = { files: (d.files || []).length, lines: (d.files || []).reduce((a, f) => a + (f.text ? f.text.split('\n').length : 0), 0) };
  try {
    const data_enc = await K.seal(I.pub_key, copy ? { ...d, at: Date.now() } : { app: p.app, title: p.title, ...d, at: Date.now() });
    await api('ut_share', { token: k.token, kind: copy ? 'copy' : 'share', unit: p.unit || 0, title: p.title, app: p.app || p.form || '', local_id: p.id, hash: p.hash || '', data_enc });
    p.sent = Date.now(); await putP(p);
    alert(copy ? '📤 Geschickt. Deine Lehrkraft entscheidet, ob sie die Kopie übernimmt.' : '📤 Geteilt.');
    await pollAll(); if (!home.hidden) drawHome();
  } catch (er) { alert('⚠ ' + er.message); }
}

/* ---------- JPad-Einheit: JPad (Lernmodus) im Vollbild-Fenster; eigener Stand im Gerät, verschlüsselt an die Lehrkraft ---------- */
let J = null;
const LOCK_TEXT = 'Deine Lehrkraft bearbeitet gerade deinen Code – du bekommst ihn gleich zurück.';
async function openJPad(k, u, doc, I) {
  clearInterval(homeT);
  const A = await import('../vendor/pathfinder/core/pfapp.js');
  const key = `${k.c}:${u.id}`, saved = await getU(key).catch(() => null), e0 = u.edit || null;
  J = { k, u, A, pub: I.pub_key, key, last: saved || null, dirty: false, t: null, sending: false, watch: !!I.watch, locked: !!e0?.lock, ev: saved?.ev || 0, ef: null, cupd: null };
  let comments = []; try { if (e0?.comments_enc) comments = (await K.openExamDoc(k.k, e0.comments_enc)).list || []; J.cupd = e0?.cupd ?? null; } catch (er) { }
  A.openApp({ app: 'jpad', url: I.apps?.jpad, mode: 'unterricht', task: 'u' + u.id, title: '🟢 ' + (u.title || 'JPad'), files: saved?.files || [], readonly: J.locked, closeLabel: '‹ Übersicht',
    extra: { comments, ...(J.locked ? { lockText: LOCK_TEXT } : {}), ...(doc.jcode ? { jcode: doc.jcode } : {}), ...(doc.project ? { project: doc.project, projectKey: 'u' + u.id } : {}) },
    onState: st => { if (J.locked) return; J.last = { id: key, ev: J.ev, files: st.files, run: st.run || J.last?.run || null }; J.dirty = true; putU(J.last).catch(() => { }); clearTimeout(J.t); J.t = setTimeout(sendJ, J.watch ? 1200 : 3000); },
    onClose: async () => { clearTimeout(J?.pt); await sendJ(); const c = J?.k?.c; J = null; goNext({ c }); } });
  // Hinweis in der Kopfleiste, solange die Lehrkraft zuschaut
  const bar = A.appBar(); let w = bar?.querySelector('.u-watch');
  if (bar && !w) { w = document.createElement('span'); w.className = 'u-watch'; w.textContent = '👁 Deine Lehrkraft schaut gerade zu'; bar.insertBefore(w, bar.querySelector('[data-close]')); }
  const badge = () => { if (w) { w.hidden = !J?.watch && !J?.locked; w.textContent = J?.locked ? '✎ Deine Lehrkraft bearbeitet deinen Code' : '👁 Deine Lehrkraft schaut gerade zu'; } };
  badge();
  if (e0) applyEdit(e0).then(badge);
  const tick = async () => { // Lebenszeichen (alle 8 s, beim Zuschauen bzw. Bearbeiten alle 3 s): Zuschauen, Sperre, Kommentare, Ende der Einheit
    if (!J) return;
    if (document.visibilityState === 'visible') try {
      const r = await api('ut_poll', { token: k.token, have: [u.id] });
      J.watch = !!r.watch;
      const uu = r.units.find(x => x.id === u.id);
      if (!uu) { await A.flushApp(800); const j = J; J = null; endedDialog(j, doc, I); return; } // Server nimmt nichts mehr an; der letzte Stand liegt im Gerät
      await applyEdit(uu.edit); badge();
    } catch (er) { if (er.status === 401) { alert(er.message); return; } }
    if (J) J.pt = setTimeout(tick, J.watch || J.locked ? 3000 : 8000);
  };
  J.pt = setTimeout(tick, 3000);
}
/** Sperre, Stand der Lehrkraft und Kommentare übernehmen (Inhalte mit dem Klassenschlüssel verschlüsselt) */
async function applyEdit(e) {
  if (!J || !e) return; const { A, k } = J;
  if (e.cupd !== J.cupd) { J.cupd = e.cupd; let list = []; try { if (e.comments_enc) list = (await K.openExamDoc(k.k, e.comments_enc)).list || []; } catch (er) { } A.appComments(list); }
  if (e.lock) {
    if (!J.locked) { // erst den eigenen Stand sichern, dann sperren und der Lehrkraft bestätigen
      await A.flushApp(800); J.locked = true; J.ev = e.v; A.setAppReadonly(true, LOCK_TEXT);
      await sendJ(e.v);
    } else if (J.ev !== e.v) { J.ev = e.v; await sendJ(e.v); }
    if (e.files_enc && e.files_enc !== J.ef) { J.ef = e.files_enc; try { const f = (await K.openExamDoc(k.k, e.files_enc)).files; if (f?.length) A.updateApp(f); } catch (er) { } }
  } else if (J.locked || e.v > J.ev) { // zurückgegeben (mit dem Stand der Lehrkraft) bzw. verworfen
    const was = J.locked; J.ev = e.v; J.ef = null;
    if (e.files_enc) try {
      const f = (await K.openExamDoc(k.k, e.files_enc)).files;
      if (f?.length) { if (!was) A.setAppReadonly(true); A.updateApp(f); J.last = { id: J.key, ev: J.ev, files: f, run: J.last?.run || null }; J.dirty = true; }
    } catch (er) { }
    if (J.last) { J.last.ev = J.ev; putU(J.last).catch(() => { }); }
    J.locked = false; A.setAppReadonly(false);
    if (was) alert(e.files_enc ? 'Deine Lehrkraft hat dir deinen Code zurückgegeben – mit ihren Änderungen. Du kannst weiterarbeiten.' : 'Du kannst weiterarbeiten.');
    sendJ();
  }
}
/* ---------- Beendete JPad-Einheit: ansehen (schreibgeschützt), private Kopie, in JPad weiterarbeiten oder als Datei sichern ---------- */
/** eigener Stand als JPad-Projekt: Code, dazu Lernpfad und Sprites aus dem Material bzw. der JCode (JPad lädt ihn selbst) */
function projectOf(title, files, doc) {
  return { name: title || 'Projekt aus Probe', files: files || [], ...(doc?.jcode ? { jcode: doc.jcode } : {}),
    ...(doc?.project?.lernpfadHtml ? { lernpfadHtml: doc.project.lernpfadHtml } : {}), ...(doc?.project?.spritesheetBase64 ? { spritesheetBase64: doc.project.spritesheetBase64 } : {}) };
}
/** „In JPad weiterarbeiten“: JPad im neuen Tab (?von=probe) holt das Projekt per Nachricht ab und legt es als eigenes Projekt an */
function toJPad(url, p) {
  if (!url) { alert('JPad ist hier nicht eingerichtet.'); return; }
  const w = window.open(url + (url.includes('?') ? '&' : '?') + 'von=probe', '_blank'), origin = new URL(url, location.href).origin;
  if (!w) { alert('Das neue Fenster wurde blockiert. Sichere das Projekt stattdessen als Datei und öffne es in JPad.'); return; }
  let done = false;
  const on = ev => { if (ev.source !== w || ev.origin !== origin || ev.data?.type !== 'jpad-import-ready' || done) return; done = true; removeEventListener('message', on); w.postMessage({ type: 'jpad-import', project: p }, origin); };
  addEventListener('message', on);
  setTimeout(() => { if (!done) { removeEventListener('message', on); alert('JPad hat sich nicht gemeldet. Sichere das Projekt stattdessen als Datei („⇩ Als Datei“) und öffne die Datei in JPad.'); } }, 20000);
}
/** Projektdatei im Format von JPad / Online-IDE herunterladen */
function saveFile(p) {
  const data = { name: p.name, modules: (p.files || []).map((f, i) => ({ name: String(f.name).replace(/\.java$/, '') + '.java', text: f.text || '', id: i, isFolder: false })),
    ...(p.lernpfadHtml ? { lernpfadHtml: p.lernpfadHtml } : {}), ...(p.spritesheetBase64 ? { spritesheetBase64: p.spritesheetBase64 } : {}) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `JPad-${String(p.name).replace(/[^\wÄÖÜäöüß -]+/g, '').trim().replace(/\s+/g, '-') || 'Projekt'}.json`; document.body.appendChild(a); a.click(); a.remove();
}
/** Knöpfe in der Kopfleiste von JPad (beendet: Kopie, JPad, Datei; Kopie/eigenes Projekt: schicken bzw. teilen) */
function jButtons(A, html, on) {
  const bar = A.appBar(); if (!bar) return; bar.querySelector('.u-watch')?.setAttribute('hidden', '');
  let box = bar.querySelector('.u-jb'); if (!box) { box = document.createElement('span'); box.className = 'u-jb'; bar.insertBefore(box, bar.querySelector('[data-close]')); }
  box.innerHTML = html; box.onclick = e => { const x = e.target.closest('[data-x]')?.dataset.x; if (x) on(x); };
}
function endedButtons(A, url, p, o) {
  jButtons(A, '<button class="alt" data-x="copy" title="Eigene Kopie zum Weiterarbeiten – deine Lehrkraft sieht sie nicht, du kannst sie ihr aber schicken">✎ Private Kopie</button><button class="alt" data-x="jpad">☕ In JPad</button><button class="alt" data-x="file">⇩ Datei</button>',
    x => { if (x === 'jpad') toJPad(url, p); if (x === 'file') saveFile(p); if (x === 'copy') makeCopy({ ...o, form: 'jpad', files: p.files }); });
}
/** Die Lehrkraft hat die Einheit gerade beendet: was jetzt? */
function endedDialog(j, doc, I) {
  const A = j.A, files = j.last?.files || [], p = projectOf(j.u.title, files, doc), ov = document.querySelector('.pfapp-ov'), o = { k: j.k, I, u: j.u };
  A.setAppReadonly(true, 'Die Einheit ist beendet – nur ansehen.');
  A.appStatus('🔴 beendet – nur ansehen');
  endedButtons(A, I.apps?.jpad, p, o);
  if (!ov) return;
  const box = document.createElement('div'); box.className = 'u-endbox';
  box.innerHTML = `<div class="u-endin"><h2>Deine Lehrkraft hat die Einheit beendet</h2><p>Dein Stand ist gespeichert – deine Lehrkraft sieht ihn so, wie er jetzt ist.</p>
    <p>Du kannst dein Projekt hier weiter <b>ansehen</b> (ausführen geht, ändern nicht), als <b>private Kopie</b> weiterbauen (die kannst du deiner Lehrkraft später schicken) oder als <b>eigenes Projekt in JPad</b> weiterbauen.</p>
    <div class="u-endbtns"><button data-e="view">👁 Ansehen</button><button data-e="copy">✎ Private Kopie</button><button data-e="jpad">☕ In JPad weiterarbeiten</button><button data-e="file">⇩ Als Datei sichern</button><button data-e="home">‹ Zur Übersicht</button></div></div>`;
  ov.appendChild(box);
  box.onclick = e => {
    const x = e.target.closest('[data-e]')?.dataset.e; if (!x) return;
    if (x === 'jpad') toJPad(I.apps?.jpad, p); else if (x === 'file') saveFile(p);
    else if (x === 'copy') { makeCopy({ ...o, form: 'jpad', files }); return; }
    else if (x === 'home') { A.closeApp(true); goNext({ c: j.k.c }); return; }
    box.remove();
  };
}
/** Beendete JPad-Einheit aus der Übersicht öffnen: eigener Stand aus dem Gerät, schreibgeschützt */
async function openEnded(k, u, doc, I) {
  const saved = await getU(`${k.c}:${u.id}`).catch(() => null);
  if (!saved?.files?.length && !confirm('Auf diesem iPad ist kein eigener Stand gespeichert. Trotzdem den Startcode ansehen?')) return;
  clearInterval(homeT);
  const A = await import('../vendor/pathfinder/core/pfapp.js'), p = projectOf(u.title, saved?.files || [], doc);
  A.openApp({ app: 'jpad', url: I.apps?.jpad, mode: 'unterricht', task: 'u' + u.id, title: '🔴 ' + (u.title || 'JPad'), files: saved?.files || [], readonly: true, closeLabel: '‹ Übersicht',
    extra: { ...(doc.jcode ? { jcode: doc.jcode } : {}), ...(doc.project ? { project: doc.project, projectKey: 'u' + u.id } : {}) },
    onClose: () => goNext({ c: k.c }) });
  A.appStatus('beendet – nur ansehen');
  endedButtons(A, I.apps?.jpad, p, { k, I, u });
}
/** private Kopie einer JPad-Einheit bzw. eigenes JPad-Projekt: alles nur im Gerät */
async function openJCopy(o) {
  clearInterval(homeT);
  const { k, I, p } = o, doc = o.doc, A = await import('../vendor/pathfinder/core/pfapp.js'), copy = p.kind === 'copy';
  A.openApp({ app: 'jpad', url: I.apps?.jpad, mode: 'unterricht', task: p.id, title: (copy ? '🟡 ' : '☕ ') + p.title, files: p.data?.files || [], closeLabel: '‹ Übersicht',
    extra: { ...(doc?.jcode ? { jcode: doc.jcode } : {}), ...(doc?.project ? { project: doc.project, projectKey: p.id } : {}) },
    onState: st => { p.data = { files: st.files, run: st.run || p.data?.run || null }; saveP(p).catch(() => { }); },
    onClose: async () => { await A.flushApp(600).catch(() => { }); goNext({ c: k.c }); } });
  A.appStatus(copy ? 'private Kopie – deine Lehrkraft sieht Änderungen nicht' : 'nur auf diesem iPad');
  jButtons(A, `<button class="alt" data-x="send">📤 ${copy ? 'An Lehrkraft schicken' : 'Mit Lehrkraft teilen'}</button>`, async () => { await A.flushApp(600).catch(() => { }); sendProject(p); });
}
async function sendJ(ack) {
  if (!J || (!J.dirty && ack == null) || J.sending) return; J.sending = true; clearTimeout(J.t);
  const L = J.last || { files: [] }, lines = (L.files || []).reduce((a, f) => a + (f.text ? f.text.split('\n').length : 0), 0);
  try {
    const data_enc = await K.seal(J.pub, { files: L.files, run: L.run, sum: { files: (L.files || []).length, lines }, at: Date.now() });
    await api('ut_save', { token: J.k.token, unit: J.u.id, data_enc, ...(ack != null ? { ack } : {}) }); J.dirty = false;
  } catch (er) { if (er.offline) J.t = setTimeout(() => sendJ(ack), 15000); }
  finally { if (J) J.sending = false; }
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && J?.dirty) { J.A.flushApp(600).then(() => sendJ()); } });
addEventListener('pagehide', () => { if (J?.dirty) sendJ(); });

/* ---------- Stand senden (Lernpfad, Lernpfad + App) ---------- */
function label(t) { $('#sbSave').textContent = t; }
async function send(submit) {
  if (!cur || (!dirty && !submit) || sending) return; sending = true; clearTimeout(sendT);
  try {
    const data_enc = await K.seal(cur.pub, { ...(last || {}), at: Date.now() });
    await api('ut_save', { token: cur.k.token, unit: cur.u.id, data_enc, submit: submit ? 1 : 0 });
    dirty = false; label('✓ gespeichert');
    if (submit) { cur.u.submitted = 1; $('#sbSub').hidden = true; alert('✓ Abgegeben. Du kannst trotzdem weiterarbeiten – deine Lehrkraft sieht dann den neuesten Stand.'); }
  } catch (er) { label(er.offline ? '⚠ offline – wird nachgeholt' : '⚠ ' + er.message); if (er.status === 409) ended(); else if (er.offline) sendT = setTimeout(() => send(submit), 15000); }
  finally { sending = false; }
}
function ended(msg) {
  const e = $('#uEnd'); e.hidden = false; e.textContent = msg || 'Deine Lehrkraft hat diese Einheit beendet. Dein letzter Stand ist gespeichert – über die Übersicht kannst du ihn ansehen oder als private Kopie weiterbearbeiten.';
  $('#sbSub').hidden = true; $('#sbSt').textContent = '🔴 beendet'; cur = null;
}
$('#sbSub').onclick = () => { if (confirm('Bearbeitung jetzt abgeben?')) { dirty = true; send(true); } };
$('#sbBack').onclick = () => { if (dirty) send(false); setTimeout(backHome, dirty ? 800 : 0); };
addEventListener('pagehide', () => { if (dirty && cur) send(false); });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty && cur) send(false); });

/* ---------- Start ---------- */
(async () => {
  let msg = '', next = null;
  try { next = JSON.parse(sessionStorage.getItem('pfp-next') || 'null'); sessionStorage.removeItem('pfp-next'); } catch (e) { }
  if (location.hash.startsWith('#t=')) msg = (await joinFromHash()) || '';
  else if (location.hash.startsWith('#u=')) { const p = await pairFromHash(); msg = p?.ok ? `<div class="u-hint">✓ Gekoppelt${p.v ? ` – hallo ${esc(p.v)}!` : ''}</div>` : `<div class="u-hint u-err">${esc(p?.error || 'QR-Code ungültig')}</div>`; }
  else if (location.hash.startsWith('#m=')) msg = await takeMove();
  else if (location.hash) history.replaceState(null, '', location.pathname);
  await prepMove();
  if (next?.c != null) { VIEW.c = next.c; history.replaceState(null, '', here()); history.pushState({ c: next.c }, '', here()); }
  else if ((await allK()).length === 1) { /* eine Klasse: gleich hinein */ VIEW.c = (await allK())[0].c; history.replaceState(null, '', here()); history.pushState({ c: VIEW.c }, '', here()); }
  await drawHome(msg); await pollAll(); await drawHome(msg); startPoll();
  if (next?.p) openProject(next.p);
})();
function startPoll() {
  homeT = setInterval(async () => { if (document.visibilityState === 'visible' && home.hidden === false) { await pollAll(); drawHome(); } }, 10000);
}
