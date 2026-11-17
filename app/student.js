// Probe – Schüler-Seite: Einlass mit Namen (und PIN), Prüfung im PathFinder-Abspieler, Zwischenstände, Abgabe, Ergebniscode.
// Antworten und Name gehen nur verschlüsselt an den Server (mit dem öffentlichen Schlüssel der Lehrkraft).
import { startPathFinder } from '../vendor/pathfinder/core/pathfinder.js';
import * as K from './crypto.js';
import { qrSvg } from './qr.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const code = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const SK = 'probe.s.' + code;
const screen = $('#screen');
let st = load(), info = null, ctx = null, skew = 0, deadline = null, auto = true, dirty = false, timer = null, sending = false, finished = false, lastOk = 0;

function load() { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } }
function keep() { try { localStorage.setItem(SK, JSON.stringify(st)); } catch (e) { } }
class Offline extends Error { }
async function api(a, data = {}) {
  let r, j;
  try { r = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, code, ...data }), cache: 'no-store' }); }
  catch (e) { throw new Offline('Keine Verbindung'); }
  try { j = await r.json(); } catch (e) { throw new Offline('Server antwortet nicht'); }
  if (!j.ok) { const er = new Error(j.error || 'Fehler'); er.status = r.status; throw er; }
  return j;
}
const show = html => { screen.hidden = false; screen.className = 'screen'; screen.innerHTML = `<div class="card">${html}</div>`; };
const resultLink = () => new URL('e.html', location.href).href.replace(/[?#].*$/, '') + '#' + st.rc;

/* ---------- Start ---------- */
async function boot() {
  if (!code) { show('<h2>Kein Prüfungscode</h2><p class="help">Scanne den QR-Code deiner Lehrkraft.</p>'); return; }
  if (st.done) { done(); return; }
  try {
    if (st.token) {
      const r = await api('p_resume', { token: st.token });
      if (r.status === 'abgegeben' || ['beendet', 'veroeffentlicht'].includes(r.exam_status)) { st.done = true; keep(); done(); return; }
      return run(r);
    }
    info = await api('p_info');
    joinForm();
  } catch (e) {
    if (e instanceof Offline && st.token && st.doc) return run({ doc: st.doc, pub_key: st.pub, deadline: st.deadline, auto: st.auto !== false, now: Math.round(Date.now() / 1000), exam_status: 'offen', status: 'aktiv' }, true);
    show(`<img class="ic" src="app/icon.svg" alt=""><h2>Prüfung nicht erreichbar</h2><p class="err">${esc(e.message)}</p><button class="btn alt" onclick="location.reload()">Nochmal versuchen</button>`);
  }
}
function joinForm() {
  const x = info.exam;
  if (x.status !== 'offen' || !x.join_open) { show(`<img class="ic" src="app/icon.svg" alt=""><h2>${x.status === 'offen' ? 'Einlass geschlossen' : x.status === 'entwurf' || x.status === 'geschlossen' ? 'Die Prüfung ist nicht geöffnet' : 'Die Prüfung ist beendet'}</h2><p class="meta">${esc(x.klasse)} · ${esc(x.fach)} · ${esc(x.art)}</p><p class="help">Bitte melde dich bei deiner Lehrkraft.</p><button class="btn alt" onclick="location.reload()">Nochmal versuchen</button>`); return; }
  show(`<img class="ic" src="app/icon.svg" alt=""><h1>${esc(x.titel || 'Prüfung')}</h1><p class="meta">${esc(x.klasse)} · ${esc(x.fach)} · ${esc(x.art)}${x.dauer ? ` · ${x.dauer} Minuten` : ''}</p>
    <form id="f" style="display:contents"><label>Vorname<input id="v" autocomplete="given-name" autocapitalize="words" required></label>
    <label>Nachname<input id="n" autocomplete="family-name" autocapitalize="words" required></label>
    ${x.pin_on ? '<label>PIN (steht an der Tafel)<input id="pin" class="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required></label>' : ''}
    <p class="help">Gib deinen richtigen Namen ein – so ordnet deine Lehrkraft deine Arbeit zu.</p>
    <div class="err" id="err"></div><button class="btn">Prüfung beginnen</button></form>`);
  $('#v').focus();
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const b = $('#f .btn'); b.disabled = true; $('#err').textContent = '';
    const v = $('#v').value.trim(), n = $('#n').value.trim();
    try {
      const rc = K.resultCode(), identity_enc = await K.seal(info.pub_key, { v, n, rc });
      const r = await api('p_join', { pin: $('#pin')?.value || '', identity_enc });
      st = { token: r.token, pid: r.pid, rc, v, n, pub: r.pub_key, identity_enc, answers: {}, fokus: 0, doc: r.doc, deadline: r.deadline, auto: r.auto !== false };
      keep(); run(r);
    } catch (e) { $('#err').textContent = e.message; b.disabled = false; }
  };
}

/* ---------- Prüfung ---------- */
function run(r, offline = false) {
  st.doc = r.doc; st.pub = r.pub_key; keep();
  skew = (r.now || Date.now() / 1000) - Date.now() / 1000;
  setDeadline(r.deadline, r.auto);
  screen.hidden = true; $('#app').hidden = false; $('#sbar').hidden = false;
  const D = r.doc; $('#sbT').textContent = [D.kicker, D.title].filter(Boolean).map(s => s.replace(/<[^>]*>/g, '')).join(' · ') || 'Prüfung';
  ctx = startPathFinder({
    player: true, doc: D, storage: 'probe-s', appName: 'Probe', logo: 'app/icon.svg', answers: st.answers || {},
    host: {
      onAnswer: (id, v, all) => { st.answers = all; keep(); dirty = true; clearTimeout(timer); timer = setTimeout(() => send(false), 3000); saveLabel(); },
      submit: async () => { await send(true); },
      studentName: () => `${st.v} ${st.n}`, examToken: () => String(st.token || '').slice(0, 16),
    }
  });
  if (offline) saveLabel(true);
  // alle 20 s speichern bzw. nachfragen; in den letzten 2 Minuten alle 5 s, damit eine Verlängerung rechtzeitig ankommt
  let n = 0; setInterval(() => { n++; const near = deadline && deadline - (Date.now() / 1000 + skew) < 120; if (n % 4 && !near) return; if (dirty) send(false); else ping(); }, 5000);
  setInterval(tick, 1000); tick();
  fullscreenScroll();
  status(r);
}
async function send(final) {
  if (sending && !final) return; sending = true; clearTimeout(timer);
  try {
    const answers_enc = await K.seal(st.pub, { answers: st.answers || {}, at: Date.now() });
    const r = await api('p_save', { token: st.token, answers_enc, final: final ? 1 : 0, fokus: st.fokus || 0 });
    if (r.saved) { dirty = false; lastOk = Date.now(); }
    saveLabel(); status(r, final);
  } catch (e) {
    if (e instanceof Offline) { saveLabel(true); if (final) { st.pendingFinal = true; keep(); offlineFinal(); } }
    else if (e.status === 409) { st.done = true; keep(); done(); }
    else saveLabel(true, e.message);
  } finally { sending = false; }
}
async function ping() {
  if (st.pendingFinal) return send(true);
  try { const r = await api('p_ping', { token: st.token, fokus: st.fokus || 0 }); lastOk = Date.now(); saveLabel(); status(r); } catch (e) { if (e instanceof Offline) saveLabel(true); }
}
function status(r, final = false) {
  if (r.deadline !== undefined) setDeadline(r.deadline, r.auto);
  if (r.now) skew = r.now - Date.now() / 1000;
  if (final && r.saved || r.status === 'abgegeben' || ['beendet', 'veroeffentlicht'].includes(r.exam_status)) { st.done = true; st.pendingFinal = false; keep(); done(r.late ? 'Die Zeit war abgelaufen – dein letzter gespeicherter Stand wurde abgegeben.' : ''); return; }
  if (r.exam_status === 'geschlossen') { screen.hidden = false; screen.className = 'screen over'; screen.innerHTML = '<div class="card"><h2>⏸ Prüfung angehalten</h2><p>Deine Lehrkraft hat die Prüfung kurz geschlossen. Deine Antworten sind gespeichert. Bitte warte.</p></div>'; }
  else if (!finished && !screen.innerHTML.includes('offline')) screen.hidden = true;
}
function setDeadline(d, a) {
  const old = deadline; deadline = d || null; $('#sbTime').hidden = !deadline;
  if (a !== undefined) { auto = a !== false; if (st.auto !== auto || st.deadline !== deadline) { st.auto = auto; st.deadline = deadline; keep(); } }
  if (old && deadline && deadline - old >= 60 && !finished) note(`⏱ Die Zeit wurde um ${Math.round((deadline - old) / 60)} min verlängert.`);
}
let checking = false;
function tick() {
  if (!deadline || finished) return;
  const left = Math.round(deadline - (Date.now() / 1000 + skew)), t = $('#sbTime');
  t.textContent = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '0:00';
  t.classList.toggle('warn', left <= 300);
  t.title = auto ? 'Bei 0:00 wird automatisch abgegeben.' : 'Bei 0:00 arbeitest du weiter, bis deine Lehrkraft die Prüfung beendet.';
  if (left > 0 || st.autoDone || checking) return;
  if (!auto) { if (!st.zeroNoted) { st.zeroNoted = true; keep(); if (dirty) send(false); note('⏰ Die Zeit ist um. Arbeite weiter, bis deine Lehrkraft die Prüfung beendet.', 8000); } return; }
  // vor der automatischen Abgabe kurz nachfragen: Vielleicht wurde gerade verlängert oder die automatische Abgabe ausgeschaltet
  checking = true;
  api('p_ping', { token: st.token, fokus: st.fokus || 0 }).then(r => { lastOk = Date.now(); status(r); }).catch(() => { }).finally(() => {
    checking = false;
    if (finished || !auto || Math.round(deadline - (Date.now() / 1000 + skew)) > 0) return;
    st.autoDone = true; keep(); send(true);
  });
}
function note(msg, ms = 6000) {
  let el = $('#sNote'); if (!el) { el = document.createElement('div'); el.id = 'sNote'; el.className = 's-note'; document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(note.t); note.t = setTimeout(() => { el.hidden = true; }, ms);
}
function saveLabel(off = false, msg = '') {
  const el = $('#sbSave');
  if (off) { el.className = 'sb-save off'; el.textContent = msg || 'offline – wird nachgereicht'; return; }
  el.className = 'sb-save'; el.textContent = dirty ? 'wird gespeichert …' : lastOk ? '✓ gespeichert ' + new Date(lastOk).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
}
function offlineFinal() {
  show(`<h2>Keine Verbindung</h2><p>Deine Abgabe wird gesendet, sobald das Internet wieder da ist. Lass diese Seite offen.</p>
    <p class="help">Zur Sicherheit: Speichere das Protokoll oder die Abgabe als Datei und gib sie deiner Lehrkraft (z. B. per AirDrop).</p>
    <button class="btn alt" id="p1">📄 Protokoll (PDF)</button><button class="btn alt" id="p2">⇩ Abgabe als Datei</button><span hidden>offline</span>`);
  $('#p1').onclick = () => ctx?.examProtocol(); $('#p2').onclick = exportFile;
  const t = setInterval(async () => { if (!st.pendingFinal) { clearInterval(t); return; } await send(true); }, 10000);
}

/* ---------- Nach der Abgabe ---------- */
function done(note = '') {
  finished = true; $('#app').hidden = true; $('#sbar').hidden = true;
  const link = resultLink();
  show(`<img class="ic" src="app/icon.svg" alt=""><h1>✓ Abgegeben</h1>${note ? `<p class="help">${esc(note)}</p>` : ''}
    <p>${st.v ? `Danke, ${esc(st.v)}! ` : ''}Mit diesem <b>Ergebniscode</b> siehst du später deine Ergebnisse:</p>
    <div class="code">${esc(st.rc || '–')}</div>
    <div class="qr">${st.rc ? qrSvg(link) : ''}</div><div class="link">${esc(link)}</div>
    <div class="shot">📸 Mach jetzt einen Screenshot von diesem Bildschirm!</div>
    <p class="help">Der Code ist nur auf diesem Gerät gespeichert. Ohne ihn kann niemand – auch nicht die Lehrkraft – deine Ergebnisseite öffnen.</p>`);
}

/* ---------- Notfall: Abgabe als Datei, Vollbild ---------- */
async function exportFile() {
  try {
    const f = { probe: 'abgabe', v: 1, code, pid: st.pid, identity_enc: st.identity_enc, answers_enc: await K.seal(st.pub, { answers: st.answers || {}, at: Date.now() }), at: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(f)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `Abgabe_${(st.n || 'Schueler').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${(st.v || '').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  } catch (e) { alert('Das hat nicht geklappt: ' + e.message); }
}
$('#sbProt').onclick = () => ctx?.examProtocol();
$('#sbExp').onclick = exportFile;
$('#sbFull').onclick = () => {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
};
/** Im Vollbild: der innere Bereich steht nie ganz oben oder unten – sonst beendet die Wischgeste in Safari das Vollbild */
function fullscreenScroll() {
  const sc = $('#scroll');
  const nudge = () => { if (!(document.fullscreenElement || document.webkitFullscreenElement)) return; const max = sc.scrollHeight - sc.clientHeight; if (max < 4) return; if (sc.scrollTop < 1) sc.scrollTop = 1; else if (sc.scrollTop > max - 1) sc.scrollTop = max - 1; };
  sc.addEventListener('scroll', () => { clearTimeout(sc._n); sc._n = setTimeout(nudge, 80); }, { passive: true });
  document.addEventListener('fullscreenchange', nudge); document.addEventListener('webkitfullscreenchange', nudge);
}
// Fokusverlust: Verlässt der Schüler den Browser, sieht es die Lehrkraft
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && st.token && !st.done) { st.fokus = (st.fokus || 0) + 1; keep(); dirty = true; send(false); } });
addEventListener('online', () => { if (st.token && !st.done) send(!!st.pendingFinal); });

boot();
