// Probe Unterricht – Seite der Schüler (l.html, am besten als Symbol auf dem Home-Bildschirm).
// Einmal den QR-Code der Lehrkraft scannen: l.html#u=<Klasse>.<Geheimnis>.<Klassenschlüssel>.<Name> → das Gerät wird mit der Klasse
// gekoppelt (Geräteschlüssel). Der Teil hinter „#“ geht nie an den Server. Danach zeigt die Seite alle gekoppelten Klassen und die
// gestarteten Lernpfade; der Bearbeitungsstand geht verschlüsselt an die Lehrkraft (nur bei Änderungen, gebündelt).
import { startPathFinder } from '../vendor/pathfinder/core/pathfinder.js';
import * as K from './crypto.js';

const $ = s => document.querySelector(s), home = $('#home');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(a, data = {}) {
  let r, j;
  try { r = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, ...data }), cache: 'no-store' }); }
  catch (e) { const er = new Error('Keine Verbindung'); er.offline = true; throw er; }
  try { j = await r.json(); } catch (e) { const er = new Error('Server antwortet nicht'); er.offline = true; throw er; }
  if (!j.ok) { const er = new Error(j.error || 'Fehler'); er.status = r.status; throw er; }
  return j;
}

/* ---------- Kopplungen im Gerät (IndexedDB) ---------- */
// Stores: k = Kopplungen (je Klasse), u = eigener Stand in App-Einheiten (JPad), Schlüssel „Klasse:Einheit“
const DB = () => new Promise((res, rej) => { const q = indexedDB.open('probe-unterricht', 2); q.onupgradeneeded = () => { const d = q.result; if (!d.objectStoreNames.contains('k')) d.createObjectStore('k', { keyPath: 'c' }); if (!d.objectStoreNames.contains('u')) d.createObjectStore('u', { keyPath: 'id' }); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function store(mode, fn, name = 'k') { const db = await DB(); return new Promise((res, rej) => { const t = db.transaction(name, mode), s = t.objectStore(name), q = fn(s); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); }
const allK = () => store('readonly', s => s.getAll()), putK = k => store('readwrite', s => s.put(k)), delK = c => store('readwrite', s => s.delete(c));
const getU = id => store('readonly', s => s.get(id), 'u'), putU = x => store('readwrite', s => s.put(x), 'u');
try { navigator.storage?.persist?.(); } catch (e) { }

/* ---------- QR-Code einlösen ---------- */
async function pairFromHash() {
  const m = location.hash.match(/^#u=(\d+)\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})\.(.*)$/); if (!m) return null;
  history.replaceState(null, '', location.pathname); // Geheimnis sofort aus der Adresse entfernen
  const [, c, s, k, nm] = m; let [v, n] = ['', '']; try { [v, n = ''] = decodeURIComponent(nm).split('|'); } catch (e) { }
  try { const r = await api('ut_pair', { class: +c, secret: s }); await putK({ c: +c, token: r.token, k, v, n, at: Date.now() }); return { ok: true, v }; }
  catch (er) { return { error: er.message }; }
}

/* ---------- Tafel-QR-Code: l.html#t=<Klasse>.<Geheimnis>.<Klassenschlüssel> – mit PIN und eigenem Namen eintragen ---------- */
async function joinFromHash() {
  const m = location.hash.match(/^#t=(\d+)\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/); if (!m) return false;
  history.replaceState(null, '', location.pathname);
  const [, c, s, k] = m, have = (await allK()).find(x => x.c === +c);
  if (have) return `<div class="u-hint">Dieses iPad ist mit dieser Klasse schon gekoppelt${have.v ? ` (${esc(have.v)} ${esc(have.n)})` : ''}.</div>`;
  let I; try { I = await api('ut_tafel_info', { class: +c, secret: s }); } catch (er) { return `<div class="u-hint u-err">${esc(er.message)}</div>`; }
  home.innerHTML = `<h1><img src="app/icon.svg" alt="">Probe Unterricht</h1>
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

/* ---------- Übersicht ---------- */
let KL = [], INFO = new Map(), DOCS = new Map(), homeT = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
async function drawHome(msg = '') {
  KL = await allK();
  home.innerHTML = `<h1><img src="app/icon.svg" alt="">Probe Unterricht</h1>
    ${msg}
    ${!KL.length ? '<div class="u-cl"><h2>Noch nicht gekoppelt</h2><p>Scanne den QR-Code, den du von deiner Lehrkraft bekommen hast (oder den Tafel-QR-Code), mit der Kamera.</p></div>' : ''}
    ${KL.length && !standalone ? '<div class="u-hint">📲 Tipp: In Safari auf <b>Teilen</b> → <b>„Zum Home-Bildschirm“</b>. Dann startest du Probe Unterricht wie eine App – und bleibst gekoppelt.</div>' : ''}
    ${KL.map(k => { const I = INFO.get(k.c); return `<div class="u-cl"><h2>${I ? `${esc(I.class.name)}${I.class.fach ? ' · ' + esc(I.class.fach) : ''}` : 'Klasse …'}</h2>
      <div class="help">${esc(k.v)} ${esc(k.n)}${I ? ` · Lehrkraft ${esc(I.teacher)}` : ''}</div>
      ${I?.error ? `<p class="u-err">${esc(I.error)}</p>${I.gone ? `<button class="btn alt" data-forget="${k.c}">Kopplung entfernen</button>` : ''}`
        : I ? (I.units.length ? I.units.map(u => `<button class="u-un" data-open="${k.c}:${u.id}">▶ <b>${esc(u.title || 'Lernpfad')}</b>${u.submitted ? '<span class="ok">✓ abgegeben</span>' : ''}</button>`).join('') : '<p class="help">Gerade ist nichts gestartet.</p>') : '<p class="help">wird geladen …</p>'}</div>`; }).join('')}
    <p class="help" style="margin-top:24px">Deine Lehrkraft sieht nur, wie weit du in den gestarteten Lernpfaden bist – verschlüsselt, nur für sie lesbar.</p>`;
}
async function pollAll() {
  for (const k of await allK()) {
    try {
      const r = await api('ut_poll', { token: k.token, have: [...DOCS.keys()].filter(x => x.startsWith(k.c + ':')).map(x => +x.split(':')[1]) });
      for (const u of r.units) if (u.doc_enc) DOCS.set(`${k.c}:${u.id}`, { enc: u.doc_enc });
      INFO.set(k.c, r);
    } catch (er) { if (!er.offline) INFO.set(k.c, { error: er.message, gone: er.status === 401, units: [] }); }
  }
}
home.onclick = async ev => {
  const o = ev.target.closest('[data-open]'), f = ev.target.closest('[data-forget]');
  if (f && confirm('Diese Kopplung von diesem Gerät entfernen?')) { await delK(+f.dataset.forget); INFO.delete(+f.dataset.forget); drawHome(); }
  if (o) { const [c, id] = o.dataset.open.split(':').map(Number); openUnit(c, id); }
};

/* ---------- Lernpfad bearbeiten ---------- */
let cur = null, sendT = null, last = null, dirty = false, sending = false;
async function openUnit(c, id) {
  const k = KL.find(x => x.c === c), I = INFO.get(c), u = I?.units.find(x => x.id === id), D = DOCS.get(`${c}:${id}`); if (!k || !u || !D) return;
  let doc; try { doc = await K.openExamDoc(k.k, D.enc); } catch (er) { alert('Der Lernpfad lässt sich mit deiner Kopplung nicht öffnen. Bitte deine Lehrkraft um einen neuen QR-Code.'); return; }
  if (u.form === 'jpad') return openJPad(k, u, doc, I);
  clearInterval(homeT); cur = { k, u, pub: I.pub_key }; history.pushState({ u: id }, '', '#lernpfad');
  home.hidden = true; $('#app').hidden = false; $('#sbar').hidden = false; $('#sbT').textContent = u.title || 'Lernpfad';
  $('#sbSub').hidden = !!u.submitted;
  startPathFinder({ player: true, doc, storage: 'probe-u', appName: 'Probe', logo: 'app/icon.svg',
    host: { onProgress: (sum, prog) => { last = { sum, prog }; dirty = true; clearTimeout(sendT); sendT = setTimeout(() => send(false), 3000); label('…'); } } });
  setInterval(async () => { // Lebenszeichen; merkt, wenn die Lehrkraft die Einheit beendet
    if (document.visibilityState !== 'visible') return;
    try { const r = await api('ut_poll', { token: k.token, have: [id] }); if (!r.units.some(x => x.id === id)) ended(); } catch (er) { if (er.status === 401) ended(er.message); }
  }, 45000);
}
/* ---------- JPad-Einheit: JPad (Lernmodus) im Vollbild-Fenster; eigener Stand im Gerät, verschlüsselt an die Lehrkraft ---------- */
let J = null;
async function openJPad(k, u, doc, I) {
  clearInterval(homeT);
  const { openApp, closeApp, flushApp } = await import('../vendor/pathfinder/core/pfapp.js');
  const key = `${k.c}:${u.id}`, saved = await getU(key).catch(() => null);
  J = { k, u, pub: I.pub_key, key, last: saved || null, dirty: false, t: null, sending: false, watch: !!I.watch, flushApp };
  openApp({ app: 'jpad', url: I.apps?.jpad, mode: 'unterricht', task: 'u' + u.id, title: u.title || 'JPad', files: saved?.files || [], closeLabel: '‹ Übersicht',
    extra: { ...(doc.jcode ? { jcode: doc.jcode } : {}), ...(doc.project ? { project: doc.project, projectKey: 'u' + u.id } : {}) },
    onState: st => { J.last = { id: key, files: st.files, run: st.run || J.last?.run || null }; J.dirty = true; putU(J.last).catch(() => { }); clearTimeout(J.t); J.t = setTimeout(sendJ, J.watch ? 1200 : 3000); },
    onClose: async () => { clearInterval(J?.iv); await sendJ(); J = null; location.hash = ''; location.reload(); } });
  // Hinweis in der Kopfleiste, solange die Lehrkraft zuschaut
  const bar = document.querySelector('.pfapp-bar'); let w = bar?.querySelector('.u-watch');
  if (bar && !w) { w = document.createElement('span'); w.className = 'u-watch'; w.textContent = '👁 Deine Lehrkraft schaut gerade zu'; bar.insertBefore(w, bar.querySelector('[data-close]')); }
  if (w) w.hidden = !J.watch;
  J.iv = setInterval(async () => { // Lebenszeichen alle 8 s: merkt Zuschauen und Ende der Einheit
    if (!J || document.visibilityState !== 'visible') return;
    try {
      const r = await api('ut_poll', { token: k.token, have: [u.id] });
      J.watch = !!r.watch; if (w) w.hidden = !J.watch;
      if (!r.units.some(x => x.id === u.id)) { clearInterval(J.iv); await sendJ(); alert('Deine Lehrkraft hat diese Einheit beendet. Dein Stand ist gespeichert.'); closeApp(true); J = null; location.hash = ''; location.reload(); }
    } catch (er) { if (er.status === 401) { clearInterval(J.iv); alert(er.message); } }
  }, 8000);
}
async function sendJ() {
  if (!J || !J.dirty || !J.last || J.sending) return; J.sending = true; clearTimeout(J.t);
  const L = J.last, lines = (L.files || []).reduce((a, f) => a + (f.text ? f.text.split('\n').length : 0), 0);
  try {
    const data_enc = await K.seal(J.pub, { files: L.files, run: L.run, sum: { files: (L.files || []).length, lines }, at: Date.now() });
    await api('ut_save', { token: J.k.token, unit: J.u.id, data_enc }); J.dirty = false;
  } catch (er) { if (er.offline) J.t = setTimeout(sendJ, 15000); }
  finally { if (J) J.sending = false; }
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && J?.dirty) { J.flushApp(600).then(sendJ); } });
addEventListener('pagehide', () => { if (J?.dirty) sendJ(); });

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
function ended(msg) { const e = $('#uEnd'); e.hidden = false; e.textContent = msg || 'Deine Lehrkraft hat diese Einheit beendet. Dein letzter Stand ist gespeichert.'; $('#sbSub').hidden = true; cur = null; }
$('#sbSub').onclick = () => { if (confirm('Bearbeitung jetzt abgeben?')) { dirty = true; send(true); } };
$('#sbBack').onclick = () => { if (dirty) send(false); setTimeout(() => { location.hash = ''; location.reload(); }, dirty ? 800 : 0); };
addEventListener('pagehide', () => { if (dirty && cur) send(false); });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty && cur) send(false); });
addEventListener('popstate', () => { if (cur || !$('#app').hidden) location.reload(); });

/* ---------- Start ---------- */
(async () => {
  let msg = '';
  if (location.hash.startsWith('#t=')) msg = (await joinFromHash()) || '';
  else if (location.hash.startsWith('#u=')) { const p = await pairFromHash(); msg = p?.ok ? `<div class="u-hint">✓ Gekoppelt${p.v ? ` – hallo ${esc(p.v)}!` : ''}</div>` : `<div class="u-hint u-err">${esc(p?.error || 'QR-Code ungültig')}</div>`; }
  else if (location.hash) history.replaceState(null, '', location.pathname);
  await drawHome(msg); await pollAll(); await drawHome(msg); startPoll();
})();
function startPoll() {
  homeT = setInterval(async () => { if (document.visibilityState === 'visible' && home.hidden === false) { await pollAll(); drawHome(); } }, 10000);
}
