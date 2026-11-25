// Probe – Oberfläche: Einrichtung, Anmeldung, Prüfungen der Lehrkraft, Admin.
// Alles Persönliche (Schülernamen, Inhalte mit Lösungen) wird hier im Browser verschlüsselt, bevor es zum Server geht.
import { tip, ensureTokens, keepTokens, qrSheetPdf } from './pqr.js';
import * as K from './crypto.js';
import { viewLive, viewEval, stopLive } from './run.js';
import { viewRespList, viewResp, viewArchiv, importArchive, respChip } from './resp.js';
import { zugangText, zugangPdf } from './zugaenge.js';
import { showPdf } from './pdf.js';
import { viewCoachingList, viewCoaching, viewBerater, coachingHint, tabsHtml, purgeAll } from './coaching.js';
import { viewSurveyList, viewSurvey } from './umfragen.js';
import { viewTalks, talksHint } from './gespraeche.js';
import { viewClass, classForm, loadClass } from './klassen.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const S = { user: null, csrf: '', keys: null, priv: null, catalog: null, sj: null };
const ARTEN = { 'Übungsprüfung': 'Übungsprüfung', AKL: 'AKL (angekündigter kleiner Leistungsnachweis)', Kurzarbeit: 'Kurzarbeit', Schulaufgabe: 'Schulaufgabe' };
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtPts = x => String(Math.round((+x || 0) * 100) / 100).replace('.', ',');

/* ---------- Server ---------- */
async function api(a, data = {}) {
  let r, j;
  try {
    r = await fetch('api.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Probe-CSRF': S.csrf || '' }, body: JSON.stringify({ a, ...data }) });
    j = await r.json();
  } catch (e) { throw new Error(r ? `Der Server antwortet nicht richtig (${r.status}). Läuft PHP?` : 'Keine Verbindung zum Server.'); }
  if (r.status === 401 && !['login', 'unlock_check', 'change_password'].includes(a)) { S.user = null; S.priv = null; boot(); throw new Error(j.error || 'Bitte anmelden'); }
  if (!j.ok) throw new Error(j.error || 'Fehler');
  return j;
}

/* ---------- kleine Bausteine ---------- */
function toast(msg, ms = 3200) { $$('.toast').forEach(x => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function busy(text) { const b = document.createElement('div'); b.className = 'busy'; b.innerHTML = `<span>${esc(text)}</span>`; document.body.appendChild(b); return () => b.remove(); }
function dialog(title, body, { wide = false } = {}) {
  const bd = document.createElement('div'); bd.className = 'dlg-bd';
  bd.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"${wide ? ' style="width:min(760px,100%)"' : ''}><header><b>${title}</b><button class="btn ghost sm" data-close aria-label="Schließen">✕</button></header><div class="body">${body}</div></div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.addEventListener('click', e => { if (e.target === bd || e.target.closest('[data-close]')) close(); });
  setTimeout(() => $('input:not([type=checkbox]), select, textarea', bd)?.focus(), 50);
  return { el: $('.dlg', bd), close };
}
const field = (label, input, help = '') => `<label class="f">${label}${input}${help ? `<span class="h">${help}</span>` : ''}</label>`;
async function withBusy(text, fn) { const done = busy(text); try { return await fn(); } finally { done(); } }
function pwRules(p1, p2) { if (p1.length < 10) return 'Das Passwort braucht mindestens 10 Zeichen.'; if (p1 !== p2) return 'Die beiden Passwörter sind verschieden.'; return ''; }

/* ---------- Start ---------- */
async function boot() {
  if (!window.isSecureContext || !crypto?.subtle) { main.innerHTML = `<div class="center"><div class="card narrow"><h2>Probe braucht HTTPS</h2><p>Die Verschlüsselung funktioniert im Browser nur auf sicheren Seiten. Rufe Probe mit <b>https://</b> auf${location.protocol === 'http:' ? ` – also <a href="${location.href.replace(/^http:/, 'https:')}">${location.href.replace(/^http:/, 'https:').replace(/[?#].*$/, '')}</a>` : ''}. Falls das nicht geht: beim Hoster für diese (Sub-)Domain ein SSL-Zertifikat einschalten.</p></div></div>`; return; }
  let st;
  try { st = await api('status'); } catch (e) { main.innerHTML = `<div class="center"><div class="card narrow"><h2>Probe ist nicht erreichbar</h2><p class="err">${esc(e.message)}</p></div></div>`; return; }
  S.csrf = st.csrf || ''; S.user = st.user; S.keys = st.keys; S.respOpen = st.resp_open || 0;
  drawWho();
  if (st.setup) return viewSetup();
  if (!S.user) { S.cHint = false; S.cDemo = false; S.uDemo = false; S.tDemo = false; return viewLogin(); }
  if (S.user.must_setup) return viewKeySetup();
  if (!S.priv) return viewUnlock();
  route();
}
/** Menüband: PathFinder | Prüfungen Respizienz | Notizen | Umfragen … rechts (Schulberatung) Coaching + Eule Lumi */
function drawNav() {
  const n = $('#topnav'); if (!n) return;
  if (!S.user || !S.priv) { n.innerHTML = ''; return; }
  const h = location.hash.replace(/^#/, '') || '/';
  const on = /^\/k\//.test(h) ? 'p' : /^\/resp/.test(h) ? 'r' : /^\/(notizen|gespraeche)/.test(h) ? 'g' : /^\/(umfragen|u\/)/.test(h) ? 'u' : /^\/(coaching|c\/)/.test(h) ? 'c' : /^\/berater/.test(h) ? 'b' : /^\/admin/.test(h) ? '' : 'p';
  const a = (k, href, t, extra = '') => `<a href="${href}"${on === k ? ' class="on" aria-current="page"' : ''}>${t}${extra}</a>`, sep = '<span class="nsep" aria-hidden="true"></span>';
  n.innerHTML = `<a href="https://pathfinder.pandapy.de" target="_blank" rel="noopener" title="PathFinder in neuem Tab öffnen">PathFinder</a>${sep}
    ${a('p', '#/', 'Prüfungen')}${S.user.fachleitung?.length ? a('r', '#/resp', 'Respizienz', S.respOpen ? ` <span class="chip warn" title="neu eingereicht">${S.respOpen}</span>` : '') : ''}${sep}
    ${a('g', '#/notizen', 'Notizen')}${sep}${a('u', '#/umfragen', 'Umfragen')}
    <span class="nsp"></span>${S.user.is_berater || S.user.is_demo ? a('b', '#/berater', 'Schulberatung') + sep : ''}${a('c', '#/coaching', 'Coaching', '<img class="lumi" src="app/lumi.gif" alt="">')}`;
  const cur = $('a.on', n); if (cur && n.scrollWidth > n.clientWidth) n.scrollLeft = cur.offsetLeft - (n.clientWidth - cur.offsetWidth) / 2; // iPhone: aktiven Bereich zeigen
}
function drawWho() {
  const w = $('#who');
  drawNav();
  if (!S.user || !S.priv) { w.innerHTML = ''; return; }
  w.innerHTML = `<span class="btns">${S.user.is_demo ? '<span class="chip warn" title="Alles wird nach ein paar Stunden gelöscht">Demo</span><button class="btn sm" id="bDemoEnd">Demo beenden</button>' : ''}${S.user.is_admin ? '<a class="btn sm ghost" href="#/admin">Admin</a>' : ''}<button class="btn sm" id="bMe">${esc(S.user.kuerzel)} ▾</button></span>`;
  $('#bDemoEnd') && ($('#bDemoEnd').onclick = endDemo);
  $('#bMe').onclick = () => {
    const d = dialog(esc(S.user.name || S.user.kuerzel), `<div class="help">Angemeldet als <b>${esc(S.user.kuerzel)}</b>${S.user.is_admin ? ' · Admin' : ''}${S.user.fachleitung.length ? ' · Fachleitung ' + S.user.fachleitung.map(f => esc(f.name)).join(', ') : ''}</div>
      <div class="btns"><button class="btn" data-fa>Meine Fächer</button>${S.user.is_demo ? '' : '<button class="btn" data-pw>Passwort ändern</button>'}<button class="btn" data-demo>Beispielprüfungen neu anlegen</button><button class="btn" data-out>Abmelden</button></div>`);
    d.el.onclick = async e => {
      if (e.target.closest('[data-out]')) { await api('logout').catch(() => { }); S.user = null; S.priv = null; S.csrf = ''; d.close(); location.hash = '#/'; boot(); }
      if (e.target.closest('[data-pw]')) { d.close(); changePassword(); }
      if (e.target.closest('[data-fa]')) { d.close(); myFaecher(); }
      if (e.target.closest('[data-demo]')) { d.close(); if (!confirm('Die Beispielprüfungen 7d und 7p noch einmal anlegen? Vorhandene bleiben, bis du sie löschst.')) return; await demos(true); location.hash = '#/'; route(); }
    };
  };
}
addEventListener('hashchange', () => { if (S.user && S.priv) { drawNav(); route(); } });
function route() {
  drawWho();
  const h = location.hash.replace(/^#/, '') || '/';
  let m;
  if (!S.cHint) { S.cHint = true; cleanLocal(); coachingHint(helpers()).then(() => talksHint(helpers())); } // nach der Anmeldung: Editor-Reste (Klartext mit Lösungen) entfernen, Coaching-Hinweise und -Zwischenstände // Coaching: ab 15. Juli bei jeder Anmeldung an Export/Löschen erinnern
  if (h === '/admin' && S.user.is_admin) return viewAdmin();
  if (h === '/coaching') { stopLive(); return viewCoachingList(helpers()); }
  if ((m = h.match(/^\/c\/(\d+)$/))) { stopLive(); return viewCoaching(helpers(), +m[1]); }
  if (h === '/berater' && (S.user.is_berater || S.user.is_demo)) { stopLive(); return viewBerater(helpers()); }
  if ((m = h.match(/^\/k\/(\d+)$/))) { stopLive(); return viewClass(helpers(), +m[1]); }
  if (h === '/notizen' || h === '/gespraeche') { stopLive(); return viewTalks(helpers()); }
  if (h === '/umfragen') { stopLive(); return viewSurveyList(helpers()); }
  if ((m = h.match(/^\/u\/(\d+)$/))) { stopLive(); return viewSurvey(helpers(), +m[1]); }
  if ((m = h.match(/^\/p\/(\d+)$/))) return viewExam(+m[1]);
  if (h === '/archiv' || (m = h.match(/^\/archiv\/(\d+)$/))) { stopLive(); return viewArchiv(m ? +m[1] : null, helpers()); }
  if (S.user.fachleitung?.length && h === '/resp') { stopLive(); return viewRespList(helpers()); }
  if (S.user.fachleitung?.length && (m = h.match(/^\/resp\/(\d+)$/))) { stopLive(); return viewResp(+m[1], helpers()); }
  if (!S.user.demo && !S.demoTried) return demos(false).then(viewDashboard);
  return viewDashboard();
}
/** Hilfen für die Ansichten in run.js und resp.js */
function helpers() { return { S, api, K, drawWho, route, dialog, toast, withBusy, esc, fmtDate, fmtPts, field, main, pickFile, parseNames, viewExam, cleanLocal, examForm, statusChip, view: x => x.draft ? openEditor(x, x.draft, true) : toast('⚠ Kein Inhalt gespeichert') }; }
/** Beispielprüfungen anlegen: beim ersten Mal von selbst, später über das Konto-Menü */
async function demos(force) {
  S.demoTried = true;
  try {
    const { seedDemos } = await import('./demo.js');
    const made = await withBusy('Beispielprüfungen werden angelegt …', () => seedDemos({ api, K, S }, force));
    S.user.demo = true;
    if (made) toast(force ? '✓ Beispielprüfungen 7d, 7p und 6a neu angelegt' : '👋 Zum Ausprobieren: drei Beispielprüfungen – Physik 7d (schon geschrieben), Physik 7p und Englisch 6a (vorbereitet)', 7000);
  } catch (er) { toast('⚠ Beispielprüfungen: ' + esc(er.message), 5000); }
}

/* ---------- Einrichtung, Anmeldung, Schlüssel ---------- */
function viewSetup() {
  main.innerHTML = `<div class="center"><div class="card narrow stack"><img class="hero-ic" src="app/icon.svg" alt=""><h1 class="tc">Probe einrichten</h1>
    <p class="help tc">Das erste Konto ist das Admin-Konto. Damit legst du danach Lehrkräfte, Fachschaften und Fächer an.</p>
    ${field('Nutzername', '<input type="text" id="k" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username">', 'Damit meldest du dich an, z. B. dein Lehrerkürzel.')}
    ${field('Name (optional)', '<input type="text" id="n" autocomplete="name">')}
    ${field('Passwort', '<input type="password" id="p1" autocomplete="new-password">', 'Mindestens 10 Zeichen.')}
    ${field('Passwort wiederholen', '<input type="password" id="p2" autocomplete="new-password">')}
    <div class="err" id="err"></div><button class="btn pri" id="go">Einrichten</button></div></div>`;
  $('#go').onclick = async () => {
    const k = $('#k').value.trim(), p1 = $('#p1').value, p2 = $('#p2').value, e = pwRules(p1, p2);
    if (!k) { $('#err').textContent = 'Bitte einen Nutzernamen eintragen.'; return; }
    if (e) { $('#err').textContent = e; return; }
    try {
      await withBusy('Schlüssel werden erzeugt …', async () => {
        const salt = K.randomSalt(), { auth, key } = await K.fromPassword(p1, salt), kp = await K.newKeyPair();
        const code = K.newRecoveryCode(), rec_salt = K.randomSalt();
        const r = await api('setup_admin', { kuerzel: k, name: $('#n').value.trim(), salt, auth, pub_key: kp.pub, priv_pw: await K.wrapPriv(kp.priv, key), rec_salt, priv_rec: await K.wrapPriv(kp.priv, await K.fromRecovery(code, rec_salt)) });
        S.user = r.user; S.csrf = r.csrf; S.keys = r.keys; S.priv = kp.priv;
        showRecovery(code, () => { location.hash = '#/admin'; route(); });
      });
    } catch (er) { $('#err').textContent = er.message; }
  };
}
function viewLogin() {
  main.innerHTML = `<div class="center"><form class="card narrow stack" id="f"><img class="hero-ic" src="app/icon.svg" alt=""><h1 class="tc wm hero-wm" aria-label="Probe">probe</h1><p class="help tc">Digitale Prüfungen – Anmeldung für Lehrkräfte</p>
    ${field('Nutzername', '<input type="text" id="k" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" required>')}
    ${field('Passwort', '<input type="password" id="p" autocomplete="current-password" required>')}
    <div class="err" id="err"></div><button class="btn pri">Anmelden</button>
    <p class="help tc">Passwort vergessen? Der Admin setzt ein neues Startpasswort. Deine Prüfungen öffnest du danach mit deinem Wiederherstellungscode.</p></form>
    <div class="card narrow demo-card"><button type="button" class="demo-btn" id="demo"><img src="app/icon.svg" alt=""><span><b>Demo-Modus starten</b><small>ohne Konto ausprobieren</small></span><i aria-hidden="true">›</i></button>
    <p class="help tc">Eine Prüfung zum Auswerten und eine startklare, die du mit einem Schüler-iPad per QR-Code ausprobieren kannst. Jede Demo ist für sich – nach 4 Stunden wird alles gelöscht.</p></div></div>`;
  $('#demo').onclick = startDemo;
  setTimeout(() => $('#k').focus(), 50);
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); $('#err').textContent = '';
    const k = $('#k').value.trim(), p = $('#p').value;
    try {
      await withBusy('Anmelden …', async () => {
        const { salt } = await api('prelogin', { kuerzel: k });
        const { auth, key } = await K.fromPassword(p, salt);
        const r = await api('login', { kuerzel: k, auth });
        S.user = r.user; S.csrf = r.csrf; S.keys = r.keys;
        if (S.user.must_setup) { S.startPw = p; viewKeySetup(); return; }
        S.priv = await K.unwrapPriv(S.keys.priv_pw, key);
        route();
      });
    } catch (er) { $('#err').textContent = er.message; }
  };
}
function viewUnlock() {
  main.innerHTML = `<div class="center"><form class="card narrow stack" id="f"><img class="hero-ic" src="app/icon.svg" alt=""><h2 class="tc">Willkommen zurück, ${esc(S.user.kuerzel)}</h2>
    <p class="help tc">Zum Entschlüsseln deiner Prüfungen brauchen wir noch einmal dein Passwort. Es verlässt dieses Gerät nicht.</p>
    ${field('Passwort', '<input type="password" id="p" autocomplete="current-password" required>')}
    <div class="err" id="err"></div><div class="btns"><button class="btn pri">Entsperren</button><button type="button" class="btn ghost" id="out">Abmelden</button></div></form></div>`;
  setTimeout(() => $('#p').focus(), 50);
  $('#out').onclick = async () => { await api('logout').catch(() => { }); S.user = null; boot(); };
  const dm = S.user.is_demo && demoCreds(); // Demo nach dem Neuladen: ohne Passwort weiter
  if (dm && dm.k === S.user.kuerzel) setTimeout(() => { $('#p').value = dm.pw; $('#f').requestSubmit(); }, 0);
  $('#f').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await withBusy('Entsperren …', async () => {
        const { salt } = await api('prelogin', { kuerzel: S.user.kuerzel });
        const { auth, key } = await K.fromPassword($('#p').value, salt);
        await api('unlock_check', { auth });
        S.priv = await K.unwrapPriv(S.keys.priv_pw, key);
        route();
      });
    } catch (er) { $('#err').textContent = er.message; }
  };
}
/* ---------- Demo-Modus: vorübergehendes Konto, eigene Schlüssel, Beispielprüfungen ---------- */
const DEMO_KEY = 'probe.demo';
const demoCreds = () => { try { return JSON.parse(sessionStorage.getItem(DEMO_KEY)); } catch (e) { return null; } };
async function startDemo() {
  try {
    await withBusy('Demo wird vorbereitet …', async () => {
      const pw = K.startPassword(), salt = K.randomSalt(), { auth, key } = await K.fromPassword(pw, salt), kp = await K.newKeyPair();
      const r = await api('demo_start', { salt, auth, pub_key: kp.pub, priv_pw: await K.wrapPriv(kp.priv, key) });
      S.user = r.user; S.csrf = r.csrf; S.keys = r.keys; S.priv = kp.priv; S.demoTried = false;
      try { sessionStorage.setItem(DEMO_KEY, JSON.stringify({ k: r.user.kuerzel, pw })); } catch (e) { }
    });
    location.hash = '#/'; route();
  } catch (er) { toast('⚠ ' + esc(er.message), 5000); }
}
async function endDemo() {
  if (!confirm('Demo beenden? Alle Demo-Prüfungen werden sofort gelöscht.')) return;
  await api('demo_end').catch(() => { });
  try { sessionStorage.removeItem(DEMO_KEY); } catch (e) { }
  S.user = null; S.priv = null; S.csrf = ''; location.hash = '#/'; boot();
}

/** erstes Anmelden (oder nach neuem Startpasswort): eigenes Passwort, Schlüssel neu oder per Wiederherstellungscode behalten */
function viewKeySetup() {
  const had = S.user.has_keys;
  main.innerHTML = `<div class="center"><div class="card narrow stack"><img class="hero-ic" src="app/icon.svg" alt=""><h2 class="tc">${had ? 'Neues Passwort festlegen' : `Willkommen bei Probe, ${esc(S.user.name || S.user.kuerzel)}!`}</h2>
    <p class="help tc">${had ? 'Der Admin hat dir ein neues Startpasswort gegeben. Mit deinem Wiederherstellungscode bleiben deine Prüfungen lesbar.' : 'Lege jetzt dein eigenes Passwort fest. Damit werden deine Prüfungen verschlüsselt – nicht einmal der Admin kann sie lesen.'}</p>
    ${field('Neues Passwort', '<input type="password" id="p1" autocomplete="new-password">', 'Mindestens 10 Zeichen.')}
    ${field('Passwort wiederholen', '<input type="password" id="p2" autocomplete="new-password">')}
    ${had ? `${field('Wiederherstellungscode', '<input type="text" id="rc" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX">')}
      <label class="ck"><input type="checkbox" id="fresh">Ich habe keinen Code mehr – neu beginnen. Meine bisherigen Prüfungen werden gelöscht.</label>` : ''}
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">Weiter</button><button class="btn ghost" id="out">Abmelden</button></div></div></div>`;
  $('#out').onclick = async () => { await api('logout').catch(() => { }); S.user = null; boot(); };
  $('#go').onclick = async () => {
    const p1 = $('#p1').value, p2 = $('#p2').value, e = pwRules(p1, p2);
    if (e) { $('#err').textContent = e; return; }
    const fresh = !had || $('#fresh').checked;
    try {
      await withBusy('Schlüssel werden eingerichtet …', async () => {
        const salt = K.randomSalt(), { auth, key } = await K.fromPassword(p1, salt);
        if (!fresh) {
          let priv; try { priv = await K.unwrapPriv(S.keys.priv_rec, await K.fromRecovery($('#rc').value, S.keys.rec_salt)); } catch (x) { throw new Error('Der Wiederherstellungscode passt nicht.'); }
          const r = await api('setup_keys', { keep: 1, salt, auth, priv_pw: await K.wrapPriv(priv, key) });
          S.user = r.user; S.keys = r.keys; S.priv = priv; toast('✓ Neues Passwort gespeichert'); route(); return;
        }
        const kp = await K.newKeyPair(), code = K.newRecoveryCode(), rec_salt = K.randomSalt();
        const r = await api('setup_keys', { salt, auth, pub_key: kp.pub, priv_pw: await K.wrapPriv(kp.priv, key), rec_salt, priv_rec: await K.wrapPriv(kp.priv, await K.fromRecovery(code, rec_salt)) });
        S.user = r.user; S.keys = r.keys; S.priv = kp.priv;
        showRecovery(code, () => route());
      });
    } catch (er) { $('#err').textContent = er.message; }
  };
}
function showRecovery(code, next) {
  main.innerHTML = `<div class="center"><div class="card narrow stack printme"><h2>Dein Wiederherstellungscode</h2>
    <p>Falls du dein Passwort vergisst, öffnet nur dieser Code deine Prüfungen wieder. Niemand sonst kann ihn dir neu geben – auch nicht der Admin.</p>
    <div class="codebox">${esc(code)}</div>
    <p class="help">Probe · Konto <b>${esc(S.user.kuerzel)}</b> · erstellt am ${new Date().toLocaleDateString('de-DE')}. Ausdrucken und sicher aufbewahren, nicht auf dem iPad speichern.</p>
    <div class="btns"><button class="btn" id="pr">🖨 Drucken</button></div>
    <label class="ck"><input type="checkbox" id="ok">Ich habe den Code ausgedruckt oder sicher notiert.</label>
    <button class="btn pri" id="go" disabled>Weiter zu Probe</button></div></div>`;
  $('#pr').onclick = () => print();
  $('#ok').onchange = () => { $('#go').disabled = !$('#ok').checked; };
  $('#go').onclick = next;
}
async function myFaecher() {
  const C = await catalog(), mine = new Set(S.user.faecher || []);
  const d = dialog('Meine Fächer', `<p class="help">Beim Anlegen einer Prüfung stehen nur deine Fächer zur Wahl. Der Admin hat sie beim Anlegen deines Kontos eingetragen – hier kannst du weitere ergänzen.</p>
    <div class="row" style="gap:0 12px">${C.alle_faecher.map(f => `<label class="ck"><input type="checkbox" data-f="${f.id}"${mine.has(+f.id) ? ' checked' : ''}>${esc(f.name)}</label>`).join('')}</div>
    <div class="err" id="err"></div><button class="btn pri" id="go">Speichern</button>`, { wide: true });
  $('#go', d.el).onclick = async () => {
    try { const r = await api('my_faecher', { faecher: $$('[data-f]', d.el).filter(x => x.checked).map(x => +x.dataset.f) }); S.user = r.user; S.catalog = null; d.close(); toast('✓ Fächer gespeichert'); route(); }
    catch (er) { $('#err', d.el).textContent = er.message; }
  };
}
function changePassword() {
  const d = dialog('Passwort ändern', `${field('Bisheriges Passwort', '<input type="password" id="po" autocomplete="current-password">')}${field('Neues Passwort', '<input type="password" id="p1" autocomplete="new-password">', 'Mindestens 10 Zeichen.')}${field('Neues Passwort wiederholen', '<input type="password" id="p2" autocomplete="new-password">')}<div class="err" id="err"></div><button class="btn pri" id="go">Ändern</button>`);
  $('#go', d.el).onclick = async () => {
    const e = pwRules($('#p1', d.el).value, $('#p2', d.el).value); if (e) { $('#err', d.el).textContent = e; return; }
    try {
      await withBusy('Passwort wird geändert …', async () => {
        const { salt: oldSalt } = await api('prelogin', { kuerzel: S.user.kuerzel });
        const old = await K.fromPassword($('#po', d.el).value, oldSalt);
        const salt = K.randomSalt(), nu = await K.fromPassword($('#p1', d.el).value, salt);
        await api('change_password', { old_auth: old.auth, salt, auth: nu.auth, priv_pw: await K.wrapPriv(S.priv, nu.key) });
        const st = await api('status'); S.keys = st.keys;
      });
      d.close(); toast('✓ Passwort geändert');
    } catch (er) { $('#err', d.el).textContent = er.message; }
  };
}

/* ---------- Prüfungen: Übersicht ---------- */
async function catalog() { if (!S.catalog) S.catalog = await api('catalog'); if (!S.sj) S.sj = S.catalog.schuljahr; return S.catalog; }
const STATUS = { offen: ['🟢 läuft', 'good'], geschlossen: ['⏸ geschlossen', 'warn'], beendet: ['Auswertung', 'warn'], veroeffentlicht: ['✓ veröffentlicht', 'good'] };
const statusChip = e => e.status !== 'entwurf' ? `<span class="chip ${STATUS[e.status]?.[1] || ''}">${STATUS[e.status]?.[0] || esc(e.status)}${e.teilnehmer ? ` · ${e.teilnehmer} Teilnehmer` : ''}</span>`
  : !e.has_draft ? '<span class="chip warn">Inhalt fehlt</span>'
  : e.fertig ? `<span class="chip good">✓ bereit · ${e.aufgaben} Aufgaben · ${fmtPts(e.punkte)} P.</span>` : `<span class="chip warn">Entwurf · ${e.aufgaben} Aufgaben</span>`;
async function viewDashboard() {
  main.innerHTML = '<p class="help">lädt …</p>';
  let C, L, CL;
  try { C = await catalog(); [L, CL] = await Promise.all([api('exam_list', { schuljahr: S.sj }).then(r => r.exams), api('cl_list', { schuljahr: S.sj }).then(r => r.classes)]); } catch (e) { main.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  // Prüfungen nach Klassen: angelegte Klassen zuerst (mit Noten), dann Prüfungen ohne Klasse nach Klassenname
  const inC = new Map(CL.map(c => [c.id, []])), loose = {};
  for (const e of L) if (e.class_id && inC.has(e.class_id)) inC.get(e.class_id).push(e); else (loose[e.klasse] = loose[e.klasse] || []).push(e);
  const sortK = (a, b) => a.localeCompare(b, 'de', { numeric: true });
  const tile = e => `<a class="tile" href="#/p/${e.id}"><button class="tdel" data-tdel="${e.id}" title="Prüfung löschen" aria-label="Prüfung löschen">🗑</button><span class="k">${esc(e.fach)} · ${esc(e.art)}</span><span class="t">${esc(e.titel || 'ohne Titel')}</span><span class="m">${esc(fmtDate(e.datum))}${e.dauer ? ` · ${e.dauer} min` : ''}${e.erwartet ? ` · ${e.erwartet} Teilnehmer` : ''}</span><span class="s">${statusChip(e)}${e.resp ? ' ' + respChip(e.resp) : ''}</span></a>`;
  const n = k => `${k} Prüfung${k === 1 ? '' : 'en'}`;
  const cls = CL.slice().sort((a, b) => sortK(a.name, b.name) || sortK(a.fach, b.fach)).map(c => `<div class="klasse"><h2><a href="#/k/${c.id}">${esc(c.name)}${c.fach ? ` <span class="help">${esc(c.fach)}</span>` : ''}</a></h2><span class="help">${c.roster_n} Schüler:innen · ${n(inC.get(c.id).length)}</span><span class="sp"></span><a class="btn sm" href="#/k/${c.id}">📊 Noten</a><button class="btn sm" data-cx="${c.id}">＋ Prüfung</button></div>
    ${inC.get(c.id).length ? `<div class="tiles">${inC.get(c.id).map(tile).join('')}</div>` : '<p class="help" style="margin:0 0 8px">Noch keine Prüfung.</p>'}`).join('');
  const lk = Object.keys(loose).sort(sortK);
  const rest = lk.map(k => `<div class="klasse"><h2>${esc(k)}</h2><span class="help">${n(loose[k].length)} · ohne Klasse</span><span class="sp"></span><button class="btn sm ghost" data-mk="${esc(k)}">＋ Als Klasse anlegen</button></div><div class="tiles">${loose[k].map(tile).join('')}</div>`).join('');
  main.innerHTML = `${tabsHtml('p', S)}<h1>Meine Prüfungen</h1><p class="sub">Schuljahr ${esc(S.sj)} · nach Klassen</p>
    <div class="bar"><select id="sj" style="width:auto">${C.schuljahre.map(s => `<option${s === S.sj ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select><span class="sp"></span><button class="btn" id="neuk">＋ Neue Klasse</button><button class="btn pri" id="neu">＋ Neue Prüfung</button></div>
    ${CL.length || lk.length ? cls + rest
      : `<div class="empty"><img src="app/icon.svg" alt=""><h2>Noch keine Klasse und keine Prüfung in ${esc(S.sj)}</h2><p>Lege zuerst eine Klasse an (Name und Schülerliste) – ihre Prüfungen übernehmen die Namen, und unter „Noten“ siehst du alle Ergebnisse. Oder lege direkt eine Prüfung an.</p></div>`}`;
  $('#sj').onchange = e => { S.sj = e.target.value; viewDashboard(); };
  $('#neu').onclick = () => examForm(null);
  $('#neuk').onclick = () => classForm(helpers(), null);
  main.onclick = async ev => {
    const cx = ev.target.closest('[data-cx]');
    if (cx) { try { const D = await loadClass(helpers(), +cx.dataset.cx); examForm(null, { ...D.c, roster: D.roster }); } catch (er) { toast('⚠ ' + esc(er.message)); } return; }
    const mk = ev.target.closest('[data-mk]');
    if (mk) { // Klasse aus vorhandenen Prüfungen: Namensliste der jüngsten Prüfung mit Liste übernehmen
      const G = loose[mk.dataset.mk] || [], src = G.filter(e => e.roster_n).sort((a, b) => b.datum.localeCompare(a.datum))[0];
      let roster = []; if (src) { try { roster = (await loadExam(src.id)).roster.map(r => ({ n: r.n, v: r.v })); } catch (er) { } }
      const fids = [...new Set(G.map(e => e.fach_id))];
      classForm(helpers(), null, { name: mk.dataset.mk, fach_id: fids.length === 1 ? fids[0] : '', roster }); return;
    }
    const b = ev.target.closest('[data-tdel]'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const e = L.find(x => x.id === +b.dataset.tdel);
    if (e && await deleteExam(e)) viewDashboard();
  };
}
/** Prüfung endgültig löschen – mit doppelter Nachfrage. Laufende Prüfungen erst beenden. */
async function deleteExam(e) {
  const name = `${e.klasse} · ${e.fach} · ${e.art} vom ${fmtDate(e.datum)}${e.titel ? ` („${e.titel}“)` : ''}`;
  if (['offen', 'geschlossen'].includes(e.status)) { alert(`Die Prüfung ${name} läuft noch. Beende sie zuerst, dann kannst du sie löschen.`); return false; }
  if (!confirm(`Prüfung ${name} löschen?`)) return false;
  if (!confirm(`Bist du sicher?\n\nDie Prüfung wird endgültig vom Server gelöscht – mit Inhalt, Lösungen, Klassenliste, allen Abgaben und Bewertungen sowie den Ergebnisseiten der Schüler. Das lässt sich nicht rückgängig machen.${e.resp ? '\n\nDie bei der Fachleitung eingereichte Fassung (Respizienz) bleibt dort erhalten.' : ''}`)) return false;
  try { await api('exam_delete', { id: e.id }); S.catalog = null; toast('🗑 Prüfung gelöscht'); return true; }
  catch (er) { toast('⚠ ' + esc(er.message), 5000); return false; }
}

/* ---------- Prüfung anlegen und Rahmenbedingungen ---------- */
async function examForm(e, cls = null) {
  const C = await catalog();
  const klassen = [...new Set((await api('exam_list', { schuljahr: S.sj })).exams.map(x => x.klasse))];
  const F = [...C.faecher]; if (e?.fach_id && !F.some(f => +f.id === +e.fach_id)) F.push({ id: e.fach_id, name: e.fach });
  const v = e || { klasse: cls?.name || '', fach_id: cls?.fach_id || F[0]?.id, datum: new Date().toISOString().slice(0, 10), art: 'AKL', erwartet: 0, dauer: 20, pin_on: true, skala: 'noten' };
  const d = dialog(e ? 'Rahmenbedingungen' : cls ? `Neue Prüfung · ${esc(cls.name)}` : 'Neue Prüfung', `
    ${cls ? `<p class="help">Die Namensliste der Klasse (${cls.roster?.length || 0} Schüler:innen) wird übernommen.</p>` : ''}
    <div class="row">${field('Klasse', `<input type="text" id="kl" list="kll" value="${esc(v.klasse)}" placeholder="z. B. 8b" autocapitalize="off"><datalist id="kll">${klassen.map(k => `<option value="${esc(k)}">`).join('')}</datalist>`)}
    ${field('Fach', `<select id="fa">${F.map(f => `<option value="${f.id}"${+f.id === +v.fach_id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`, C.eigene ? 'Deine Fächer – weitere über deinen Namen oben rechts → Meine Fächer.' : 'Lege über deinen Namen oben rechts → Meine Fächer fest, welche Fächer du unterrichtest.')}</div>
    <div class="row">${field('Datum', `<input type="date" id="da" value="${esc(v.datum)}">`)}${field('Art', `<select id="ar">${Object.entries(ARTEN).map(([k, n]) => `<option value="${esc(k)}"${k === v.art ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`)}</div>
    <div class="row">${field('Bearbeitungszeit (Minuten)', `<input type="number" id="du" min="0" max="600" inputmode="numeric" value="${v.dauer || ''}" placeholder="20">`, 'Leer = ohne Countdown.')}
    ${field('Erwartete Teilnehmer', `<input type="number" id="er" min="0" max="200" inputmode="numeric" value="${v.erwartet || ''}" placeholder="z. B. 28">`, 'Mit Klassenliste automatisch.')}</div>
    ${field('Bewertung', `<select id="sk"><option value="noten"${v.skala !== 'punkte' ? ' selected' : ''}>Noten 1–6</option><option value="punkte"${v.skala === 'punkte' ? ' selected' : ''}>Punkte 0–15 (Oberstufe)</option></select>`)}
    <label class="ck"><input type="checkbox" id="pin"${v.pin_on ? ' checked' : ''}>Einlass-PIN: Schüler geben zusätzlich zum QR-Code eine PIN ein, die nur am Beamer steht.</label>
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">${e ? 'Speichern' : 'Anlegen und Inhalt bauen'}</button></div>`);
  $('#go', d.el).onclick = async () => {
    const data = { id: e?.id, ...(cls ? { class_id: cls.id } : {}), klasse: $('#kl', d.el).value.trim(), fach_id: +$('#fa', d.el).value, datum: $('#da', d.el).value, art: $('#ar', d.el).value, dauer: +$('#du', d.el).value || 0, erwartet: +$('#er', d.el).value || 0, skala: $('#sk', d.el).value, pin_on: $('#pin', d.el).checked };
    if (!data.klasse) { $('#err', d.el).textContent = 'Bitte die Klasse eintragen.'; return; }
    try {
      const r = await api('exam_save', data); d.close(); S.catalog = null;
      if (e) { toast('✓ gespeichert'); viewExam(e.id); }
      else {
        if (cls?.roster?.length) await api('exam_roster', { id: r.exam.id, roster_enc: await K.seal(S.keys.pub_key, cls.roster.map(x => ({ n: x.n, v: x.v, sid: x.sid }))), roster_n: cls.roster.length });
        S.sj = r.exam.schuljahr; location.hash = '#/p/' + r.exam.id; openEditor(r.exam, null);
      }
    } catch (er) { $('#err', d.el).textContent = er.message; }
  };
}

/* ---------- Eine Prüfung ---------- */
async function loadExam(id) {
  const { exam } = await api('exam_get', { id });
  exam.draft = exam.draft_enc ? await K.open(S.priv, exam.draft_enc) : null;
  exam.roster = exam.roster_enc ? await K.open(S.priv, exam.roster_enc) : [];
  return exam;
}
async function viewExam(id) {
  main.innerHTML = '<p class="help">lädt …</p>';
  stopLive();
  let e; try { e = await loadExam(id); } catch (er) { main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a><p class="err">${esc(er.message)}</p>`; return; }
  const H = helpers();
  if (['offen', 'geschlossen'].includes(e.status)) return viewLive(e, H);
  if (['beendet', 'veroeffentlicht'].includes(e.status)) return viewEval(e, H);
  const R = e.roster || [];
  main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a>
    <h1>${esc(e.klasse)} · ${esc(e.fach)} · ${esc(e.art)}</h1><p class="sub">${esc(fmtDate(e.datum))} · Schuljahr ${esc(e.schuljahr)}</p>
    <div class="grid2"><div class="cards">
      <section class="card"><h2>Inhalt</h2>
        ${e.draft ? `<div class="stat"><div><b>${e.aufgaben}</b><span>Aufgaben</span></div><div><b>${fmtPts(e.punkte)}</b><span>Punkte</span></div><div><b>${e.fertig ? '✓' : '…'}</b><span>${e.fertig ? 'bereit' : 'Entwurf'}</span></div></div><p><b>${esc(e.titel || 'ohne Titel')}</b></p>`
          : '<p class="help">Noch kein Inhalt. Baue die Prüfung mit PathFinder – aus einem Lernpfad, mit KI oder von Grund auf.</p>'}
        ${e.draft ? `<p class="help">${e.fertig ? 'Übernommen' : 'Zwischengespeichert'} am ${new Date(e.updated * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}.${e.fertig ? '' : ' Im Editor oben rechts auf „✓ Fertig – zurück zu Probe“ tippen, dann ist die Prüfung bereit.'}</p>` : ''}
        <div class="btns"><button class="btn pri" id="edit">✎ ${e.draft ? 'Prüfung bearbeiten' : 'Inhalt bauen'}</button></div>
        <details class="help" style="margin-top:12px"><summary>Prüfung woanders gebaut?</summary><p>Hast du die Prüfung im normalen PathFinder gebaut (nicht hier in Probe), speichere sie dort unter ⋯ → Export → „Prüfungsdatei für Probe“ und lade die Datei hier.</p><button class="btn sm" id="imp">⤒ Prüfungsdatei laden</button></details></section>
      <section class="card"><h2>Klassenliste${e.class_id ? ` <a class="help" href="#/k/${e.class_id}">aus der Klasse ›</a>` : ''}</h2>
        ${R.length ? `<p>${R.length} Schüler · während der Prüfung siehst du, wer fehlt.</p><ul class="names">${R.map(s => `<li>${esc(s.n)}, ${esc(s.v)}</li>`).join('')}</ul>` : '<p class="help">Optional: Mit einer Liste der Vor- und Nachnamen erkennt Probe, wer bei der Prüfung fehlt. Die Namen werden verschlüsselt gespeichert.</p>'}
        <div class="btns" style="margin-top:10px"><button class="btn" id="csv">⤒ Klassenliste einlesen</button><button class="btn" id="paste">Namen einfügen</button>${e.class_id ? '<button class="btn" id="fromcl">⟳ aus der Klasse übernehmen</button>' : ''}${R.length ? '<button class="btn danger" id="rdel">Liste entfernen</button>' : ''}</div>
        <button class="linkbtn" data-tip="klasse">Woher bekomme ich die?</button></section>
    </div><div class="cards">
      <section class="card"><h2>Rahmenbedingungen</h2>
        <table class="t"><tr><td>Klasse</td><td><b>${esc(e.klasse)}</b></td></tr><tr><td>Fach</td><td><b>${esc(e.fach)}</b></td></tr><tr><td>Datum</td><td><b>${esc(fmtDate(e.datum))}</b></td></tr><tr><td>Art</td><td><b>${esc(ARTEN[e.art] || e.art)}</b></td></tr>
        <tr><td>Bearbeitungszeit</td><td><b>${e.dauer ? e.dauer + ' min' : 'ohne Countdown'}</b></td></tr><tr><td>Teilnehmer</td><td><b>${e.erwartet || '–'}</b></td></tr><tr><td>Einlass-PIN</td><td><b>${e.pin_on ? 'an' : 'aus'}</b></td></tr><tr><td>Bewertung</td><td><b>${e.skala === 'punkte' ? 'Punkte 0–15' : 'Noten 1–6'}</b></td></tr></table>
        <div class="btns" style="margin-top:12px"><button class="btn" id="meta">Ändern</button></div></section>
      <section class="card"><h2>Durchführung</h2>
        <div class="pqr-row"><label class="switch"><input type="checkbox" id="pqr"${e.pqr ? ' checked' : ''}${!R.length && !e.pqr ? ' disabled' : ''}><span></span></label><b>Persönliche QR-Codes</b><button class="linkbtn" data-tip="pqr">Was bedeutet das?</button></div>
        ${!R.length ? `<p class="help">${e.pqr ? '⚠ ' : ''}Dafür zuerst die Klassenliste einlesen.</p>` : ''}
        ${e.pqr && R.length ? `<div class="btns" style="margin:4px 0 8px"><button class="btn" id="qrgen">▦ QR-Codes generieren</button><span class="help">${R.filter(r => r.t).length ? `für ${R.filter(r => r.t).length} von ${R.length} Schüler:innen erzeugt` : ''}</span></div>` : ''}
        <p class="help">${e.fertig ? (e.pqr ? 'Beim Start scannen die Schüler:innen ihren persönlichen QR-Code' + (e.pin_on ? ' und geben die PIN ein' : '') : 'Beim Start bekommt die Prüfung einen QR-Code' + (e.pin_on ? ' und eine PIN' : '')) + '. Danach lässt sich der Inhalt nicht mehr ändern.' : 'Erst den Inhalt fertigstellen (im Editor „✓ Fertig – zurück zu Probe“).'}</p><button class="linkbtn chk-link" id="chk">☑ Checkliste für die Durchführung</button><button class="btn pri" id="start"${e.fertig ? '' : ' disabled'}>▶ Prüfung starten</button></section>
      <section class="card"><h2>Löschen</h2><p class="help">Löscht die Prüfung mit Inhalt und Klassenliste endgültig.</p><button class="btn danger" id="del">Prüfung löschen</button></section>
    </div></div>`;
  $('#edit').onclick = () => openEditor(e, e.draft);
  $('#start').onclick = async () => {
    if (!confirm(`Prüfung ${e.klasse} · ${e.fach} jetzt starten? Schüler können sich dann per QR-Code anmelden.`)) return;
    try { await api('exam_state', { id: e.id, to: 'offen' }); viewExam(e.id); } catch (er) { toast('⚠ ' + esc(er.message), 5000); }
  };
  $('#meta').onclick = () => examForm(e);
  main.querySelectorAll('[data-tip]').forEach(b => b.onclick = () => tip(b, TIPS[b.dataset.tip]));
  $('#pqr').onchange = async ev => {
    try { await api('exam_pqr', { id: e.id, on: ev.target.checked }); viewExam(e.id); } catch (er) { ev.target.checked = !ev.target.checked; toast('⚠ ' + esc(er.message)); }
  };
  $('#qrgen') && ($('#qrgen').onclick = () => qrCodes(e));
  $('#chk').onclick = () => checklist(e, $('#chk'));
  $('#imp').onclick = () => pickFile('.json,application/json', async f => {
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d?.stations)) throw new Error('Das ist keine Prüfungsdatei aus PathFinder.');
      if (d.form !== 'pruefung') throw new Error('Die Datei ist ein Lernpfad, keine Prüfung. Öffne sie über „Inhalt bauen“ → Aus einem Lernpfad.');
      if (e.draft && !confirm('Den bisherigen Inhalt durch die Datei ersetzen?')) return;
      await withBusy('Prüfung wird übernommen …', () => saveDraft(e.id, d, true));
      toast('✓ Prüfungsdatei übernommen'); viewExam(e.id);
    } catch (er) { toast('⚠ ' + esc(er.message), 5000); }
  });
  $('#csv').onclick = () => pickFile('.csv,.txt,text/csv,text/plain', async f => saveRoster(e, parseNames(await f.text())));
  $('#paste').onclick = () => {
    const d = dialog('Namen einfügen', `${field('Eine Zeile pro Schüler', '<textarea id="t" rows="10" placeholder="Muster;Max&#10;Beispiel;Erika&#10;oder: Max Muster"></textarea>', 'Aus Excel oder der Schulverwaltung kopieren: Nachname und Vorname in zwei Spalten, oder „Nachname, Vorname“, oder „Vorname Nachname“.')}<button class="btn pri" id="go">Übernehmen</button>`);
    $('#go', d.el).onclick = () => { const L = parseNames($('#t', d.el).value); d.close(); saveRoster(e, L); };
  };
  $('#fromcl') && ($('#fromcl').onclick = async () => { try { const D = await loadClass(helpers(), e.class_id); saveRoster(e, D.roster.map(x => ({ n: x.n, v: x.v, sid: x.sid }))); } catch (er) { toast('⚠ ' + esc(er.message)); } });
  $('#rdel') && ($('#rdel').onclick = async () => { if (!confirm('Klassenliste entfernen?')) return; await api('exam_roster', { id: e.id, roster_enc: null, roster_n: 0 }); viewExam(e.id); });
  $('#del').onclick = async () => { if (await deleteExam(e)) location.hash = '#/'; };
}
function pickFile(accept, fn) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => i.files[0] && fn(i.files[0]); i.click(); }

/** Namensliste lesen: CSV/Tabelle mit Vor- und Nachname, „Nachname, Vorname“ oder „Vorname Nachname“ */
export function parseNames(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = [';', '\t', ','].find(s => lines.slice(0, 5).every(l => l.includes(s)));
  let rows = lines.map(l => sep ? l.split(sep).map(x => x.trim().replace(/^"|"$/g, '')) : [l]);
  let iv = -1, inn = -1;
  const h = rows[0].map(x => x.toLowerCase());
  if (h.some(x => /vorname|nachname|name|schüler/.test(x))) { iv = h.findIndex(x => /vorname|rufname/.test(x)); inn = h.findIndex(x => /nachname|familienname/.test(x) || (x === 'name')); rows = rows.slice(1); }
  const out = [];
  for (const r of rows) {
    let v = '', n = '';
    if (iv >= 0 && inn >= 0) { v = r[iv] || ''; n = r[inn] || ''; }
    else if (r.length >= 2 && r[1]) { n = r[0]; v = r[1]; } // zwei Spalten: Nachname, Vorname (Schulverwaltung)
    else { const t = r[0]; if (t.includes(',')) { [n, v] = t.split(',').map(x => x.trim()); } else { const p = t.split(/\s+/); n = p.pop(); v = p.join(' '); } }
    if (v || n) out.push({ v: v.trim(), n: n.trim() });
  }
  return out.sort((a, b) => a.n.localeCompare(b.n, 'de') || a.v.localeCompare(b.v, 'de'));
}
const TIPS = {
  klasse: 'Klassenliste mit Schüler:innen aus einer Schulverwaltung (z. B. Infoportal) exportieren und hier einlesen.',
  pqr: '<p>Wird dieser Schalter aktiviert, so wählen sich die Schüler:innen mit einem <b>individuellen QR-Code</b> ein.</p><p>Wenn deaktiviert, wählen sich die Schüler:innen über einen <b>gemeinsamen</b>, an der Tafel projizierten QR-Code ein und geben anschließend ihren Namen ein.</p>',
};
/** Checkliste vor dem Start – Häkchen je Prüfung auf diesem Gerät gemerkt (nur zur Erinnerung) */
const CHECKS = e => [
  ['vorschau', 'Prüfung einmal selbst im Vorschau-Modus durchgearbeitet'],
  ...(e.pqr ? [['qr', 'Persönliche QR-Codes sind aktiviert: Sind sie bereits ausgedruckt?']] : []),
  ['notizen', 'Sind handschriftliche Notizen erlaubt?'],
  ['sicht', 'Trennwände/Sichtschutz organisiert?'],
  ['teacher', 'Teacher App: Klasse wählen und Vorlage „Digitale Prüfung mit Probe“ starten'],
  [null, 'Achtung: Startest du in der Teacher App die Vorlage für digitale Prüfungen, dann ist für die Schüler:innen nur noch die Website probe.pandapy.de, die Safari-App und die Kamera-App freigeschaltet.'],
  ['classroom', 'Apple Classroom starten und Klasse wählen: Alle Schülergeräte sichtbar?'],
  ['ersatz', '1–3 Ersatz-iPads aus dem Tabletwagen mitbringen. Diese können auch als Powerbank dienen, wenn der Akku eines Schülergeräts schwach wird.'],
];
function checklist(e, anchor) {
  const KEY = 'probe.check.' + e.id; let done = {}; try { done = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (er) { }
  const t = tip(anchor, `<b class="chk-h">Daran musst du denken</b><ul class="chk">${CHECKS(e).map(([k, txt]) => k
    ? `<li><label><input type="checkbox" data-ck="${k}"${done[k] ? ' checked' : ''}><span>${esc(txt)}</span></label></li>`
    : `<li class="chk-warn">⚠ ${esc(txt)}</li>`).join('')}</ul>`);
  t.classList.add('wide');
  t.onchange = ev => { const c = ev.target.closest('[data-ck]'); if (!c) return; done[c.dataset.ck] = c.checked; try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (er) { } };
}
/** Persönliche QR-Codes: fehlende Schlüssel ergänzen (verschlüsselt in der Klassenliste), Druckbogen als PDF */
async function qrCodes(e) {
  const R = (e.roster || []).map(r => ({ ...r }));
  if (!R.length || !e.code) { toast('⚠ Erst die Klassenliste einlesen'); return; }
  try {
    if (ensureTokens(R)) await withBusy('QR-Codes werden erzeugt …', async () => api('exam_roster', { id: e.id, roster_enc: await K.seal(S.keys.pub_key, R), roster_n: R.length }));
    e.roster = R;
  } catch (er) { toast('⚠ ' + esc(er.message), 5000); return; }
  await viewExam(e.id); // zeigt „für n von m erzeugt“ – vor dem Dialog, sonst schließt der Neuaufbau ihn
  const d = dialog('▦ Persönliche QR-Codes', `<p>Individuelle QR-Codes für deine Schüler:innen wurden generiert. Drucke sie aus und teile sie am Prüfungstermin deinen Schüler:innen aus.</p>
    <p class="help">Ein A4-Blatt je Schüler:in (${R.length} Seiten): oben Name, Prüfung, Datum, QR-Code und der Zugangscode zur persönlichen Auswertung, darunter Karopapier als Schmierblatt für die Prüfung. Kommen später Namen dazu, einfach erneut generieren – schon gedruckte Blätter bleiben gültig.</p>
    <div class="btns"><button class="btn pri" id="go">⇩ Datei laden</button></div>`);
  $('#go', d.el).onclick = () => { try { showPdf(qrSheetPdf(e, R), `QR-Codes_${e.klasse}_${e.fach}_${e.datum}.pdf`.replace(/[^\wäöüÄÖÜß.-]+/g, '_')); } catch (er) { toast('⚠ ' + esc(er.message), 5000); } };
}
async function saveRoster(e, L) {
  if (!L.length) { toast('⚠ Keine Namen erkannt'); return; }
  L = keepTokens(e.roster, L); // schon gedruckte persönliche QR-Codes bleiben für gleiche Namen gültig
  await withBusy('Klassenliste wird verschlüsselt …', async () => api('exam_roster', { id: e.id, roster_enc: await K.seal(S.keys.pub_key, L), roster_n: L.length }));
  toast(`✓ ${L.length} Namen übernommen`); viewExam(e.id);
}

/* ---------- Inhalt: PathFinder eingebettet ---------- */
const EXAM_TYPES = new Set(['task', 'quiz', 'gap', 'match', 'essay', 'mark', 'sort', 'order', 'app']);
const countTasks = d => { const t = (d.stations || []).flatMap(s => s.blocks || []).filter(b => EXAM_TYPES.has(b.type)); return { aufgaben: t.length, punkte: t.reduce((a, b) => a + Math.max(0, +(b.pts ?? 1) || 0), 0) }; };
async function saveDraft(id, d, fertig = false) {
  const data = { id, draft_enc: await K.seal(S.keys.pub_key, d), titel: (d.title || '').replace(/<[^>]*>/g, '').trim(), ...countTasks(d) };
  if (fertig) {
    const { splitExam } = await import('../vendor/pathfinder/core/pfsplit.js');
    const { student, key } = splitExam(d);
    Object.assign(data, { fertig: 1, key_enc: await K.seal(S.keys.pub_key, key), student_doc: JSON.stringify(student) });
  }
  return api('exam_draft', data);
}
/** PathFinder im Overlay. ro: schreibgeschützt ansehen (nach dem Start der Prüfung) – nichts wird gespeichert */
function openEditor(e, doc, ro = false) {
  const wrap = document.createElement('div'); wrap.className = 'editor';
  // Vorgaben für den KI-Dialog in PathFinder: Fach, Jahrgangsstufe (aus der Klasse), Umfang (Bearbeitungszeit), Kopfzeile
  const q = new URLSearchParams({ fach: e.fach, klasse: e.klasse, kopf: `${e.fach} · ${e.klasse} · ${e.art}` }); if (e.dauer) q.set('min', e.dauer);
  wrap.innerHTML = `<iframe src="editor.html?${esc(q.toString())}" title="${ro ? 'Prüfung ansehen' : 'Prüfung bearbeiten'}"></iframe>`;
  document.body.appendChild(wrap); document.body.style.overflow = 'hidden';
  const fr = $('iframe', wrap);
  let timer = null, pending = null, saving = Promise.resolve();
  const flush = () => { clearTimeout(timer); timer = null; if (!pending) return saving; const d = pending; pending = null; saving = saving.then(() => saveDraft(e.id, d)).catch(er => toast('⚠ Speichern fehlgeschlagen: ' + esc(er.message), 5000)); return saving; };
  const close = () => { wrap.remove(); document.body.style.overflow = ''; cleanLocal(); viewExam(e.id); };
  const start = () => {
    if (ro) return fr.contentWindow.probeEdit({
      doc, readOnly: true, readOnlyLabel: 'Nur ansehen – die Prüfung ist gestartet',
      host: { done: () => { wrap.remove(); document.body.style.overflow = ''; cleanLocal(); }, doneLabel: 'Schließen', doneTitle: 'Zurück zur Prüfung' },
    });
    fr.contentWindow.probeEdit({
      // Startdialog auch, wenn bisher nur eine leere Prüfung gespeichert ist (z. B. Dialog abgebrochen)
      doc: doc || undefined, startDialog: !doc || (!countTasks(doc).aufgaben && !String(doc.title || '').trim()),
      host: {
        saved: d => { pending = d; clearTimeout(timer); timer = setTimeout(flush, 1500); },
        done: async d => {
          clearTimeout(timer); pending = null;
          try { await saving; await withBusy('Prüfung wird fertiggestellt …', () => saveDraft(e.id, d, true)); toast('✓ Prüfung gespeichert und bereit'); close(); }
          catch (er) { toast('⚠ ' + esc(er.message), 5000); }
        },
        doneLabel: 'Fertig – zurück zu Probe', doneTitle: 'Prüfung speichern und zurück zur Übersicht',
      }
    });
  };
  const onMsg = ev => { if (ev.source === fr.contentWindow && ev.data?.probeEditor === 'ready') { removeEventListener('message', onMsg); start(); } };
  addEventListener('message', onMsg);
  // falls jemand die Seite verlässt: letzten Stand noch senden
  addEventListener('pagehide', flush, { once: true });
}
/** PathFinder legt im Browser Kopien an (storage „probe“) – nach dem Bearbeiten wieder entfernen */
function cleanLocal() { try { for (const k of Object.keys(localStorage)) if (/^probe\.(doc\.|docs$|cur$)/.test(k)) localStorage.removeItem(k); } catch (e) { } }

/* ---------- Admin ---------- */
let adminTab = 'lk';
async function viewAdmin() {
  let D; try { D = await api('admin_list'); } catch (e) { main.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const FS = Object.fromEntries(D.fachschaften.map(f => [f.id, f]));
  const tabs = [['lk', 'Lehrkräfte'], ['fs', 'Fachschaften'], ['fa', 'Fächer'], ['je', 'Schuljahresende'], ['si', 'Sicherheit']];
  let h = `<a class="back" href="#/">‹ Meine Prüfungen</a><h1>Admin</h1><p class="sub">Lehrkräfte, Fachschaften und Fächer. Prüfungsinhalte und Schülernamen sieht der Admin nicht.</p>
    <div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" aria-pressed="${adminTab === k}">${n}</button>`).join('')}</div><section class="card">`;
  if (adminTab === 'lk') h += `<div class="bar"><h2 style="margin:0">Lehrkräfte</h2><span class="sp"></span><button class="btn" data-umany id="umany" disabled>🔑 Passwörter zurücksetzen</button><button class="btn pri" data-uadd>＋ Lehrkraft</button></div><div class="scroll-x"><table class="t"><tr><th style="width:2.2em"><input type="checkbox" id="uall" aria-label="alle auswählen" title="alle auswählen"></th><th>Nutzername</th><th>Name</th><th>Fächer</th><th>Rollen</th><th>Status</th><th></th></tr>
    ${D.users.map(u => `<tr><td>${u.id === S.user.id ? '' : `<input type="checkbox" data-usel="${u.id}" aria-label="${esc(u.kuerzel)} auswählen">`}</td><td><b>${esc(u.kuerzel)}</b></td><td>${esc(u.name)}</td><td class="help">${D.faecher.filter(f => u.faecher.includes(+f.id)).map(f => esc(f.name)).join(', ') || '–'}</td><td><span class="fl">${+u.is_admin ? '<span class="chip">Admin</span>' : ''}${+u.is_berater ? '<span class="chip">Schulberatung</span>' : ''}${u.fachleitung.map(f => `<span class="chip">Fachleitung ${esc(FS[f]?.name)}</span>`).join('')}</span></td>
    <td>${+u.must_setup ? '<span class="chip warn">Startpasswort</span>' : '<span class="chip good">eingerichtet</span>'}</td><td class="act"><button class="btn sm" data-uedit="${u.id}">Bearbeiten</button> <button class="btn sm" data-ureset="${u.id}">Startpasswort</button> <button class="btn sm danger" data-udel="${u.id}" ${u.id === S.user.id ? 'disabled' : ''}>Löschen</button></td></tr>`).join('')}</table></div>`;
  if (adminTab === 'fs') h += `<div class="bar"><h2 style="margin:0">Fachschaften</h2><span class="sp"></span><button class="btn" data-fsauto>Fachschaften für gewählte Fächer anlegen</button><button class="btn pri" data-fsadd>＋ Fachschaft</button></div>
    ${D.fachschaften.length ? `<table class="t"><tr><th>Fachschaft</th><th>Fächer</th><th>Fachleitung</th><th></th></tr>${D.fachschaften.map(f => `<tr><td><b>${esc(f.name)}</b></td><td><span class="fl">${D.faecher.filter(x => +x.fachschaft_id === +f.id).map(x => `<span class="chip">${esc(x.name)}</span>`).join('') || '<span class="help">keine</span>'}</span></td><td>${D.users.filter(u => u.fachleitung.includes(+f.id)).map(u => esc(u.kuerzel)).join(', ') || '<span class="help">keine</span>'}</td><td class="act"><button class="btn sm" data-fsedit="${f.id}">Bearbeiten</button> <button class="btn sm danger" data-fsdel="${f.id}">Löschen</button></td></tr>`).join('')}</table>` : '<p class="help">Noch keine Fachschaft. Eine Fachschaft (z. B. „Physik“ oder „Naturwissenschaften“) bündelt Fächer; ihre Fachleitung bekommt die Prüfungen zur Respizienz.</p>'}`;
  if (adminTab === 'fa') h += `<div class="bar"><h2 style="margin:0">Fächer</h2><span class="sp"></span><button class="btn pri" data-faadd>＋ Fach</button></div><p class="help">Vorbelegt nach LehrplanPLUS Gymnasium Bayern. Ausgeblendete Fächer stehen beim Anlegen einer Prüfung nicht zur Wahl.</p>
    <table class="t"><tr><th>Fach</th><th>Fachschaft</th><th>angeboten</th><th></th></tr>${D.faecher.map(f => `<tr><td><b>${esc(f.name)}</b></td><td>${esc(FS[f.fachschaft_id]?.name || '–')}</td><td><label class="ck"><input type="checkbox" data-faakt="${f.id}"${+f.aktiv ? ' checked' : ''}></label></td><td class="act"><button class="btn sm" data-faren="${f.id}">Umbenennen</button></td></tr>`).join('')}</table>`;
  if (adminTab === 'je') h += `<h2>Schuljahresende</h2><p>Prüfungen werden nur ein Jahr aufbewahrt. Hier löschst du alle Prüfungen eines Schuljahres – oder alle. Konten, Fachschaften und Fächer bleiben.</p>
    <p class="help">Die Respizienz-Einträge werden mitgelöscht. Fachleitungen sollten vorher unter „Respizienz“ ein <b>Archiv exportieren</b>. Archive lassen sich auch mit deinem Admin-Schlüssel öffnen: <button class="btn sm" data-arch>📂 Respizienz-Archiv öffnen</button></p>
    ${D.exams.length ? `<table class="t"><tr><th>Schuljahr</th><th>Prüfungen</th></tr>${D.exams.map(x => `<tr><td>${esc(x.schuljahr)}</td><td>${x.n}</td></tr>`).join('')}</table>` : '<p class="help">Es sind keine Prüfungen gespeichert.</p>'}
    <div class="row" style="margin-top:14px">${field('Löschen', `<select id="pj"><option value="">alle Prüfungen</option>${D.exams.map(x => `<option>${esc(x.schuljahr)}</option>`).join('')}</select>`)}${field('Zur Bestätigung LÖSCHEN eintippen', '<input type="text" id="pc" autocapitalize="characters" autocomplete="off">')}</div>
    <div class="btns" style="margin-top:12px"><button class="btn danger" data-purge>Endgültig löschen</button></div>
    <h2 style="margin-top:28px">Coaching-Daten und Notizen aller Lehrkräfte</h2><p>Gesprächsnotizen (Coaching und Gespräche) und Fragebögen gehören nach einem Schuljahr gelöscht oder verschlüsselt exportiert. Lehrkräfte werden ab dem 15. Juli bei jeder Anmeldung erinnert. Hier löschst du die Coaching-Daten <b>aller</b> Lehrkräfte – lesen kann der Admin sie nicht.</p>
    <label class="ck"><input type="checkbox" id="pcr"> auch die anonymisierten Auswertungen der Schulberatung</label>
    <div class="btns" style="margin-top:12px"><button class="btn danger" data-cpurge>Coaching-Daten aller Lehrkräfte löschen</button></div>`;
  if (adminTab === 'si') h += `<h2>Sicherheit</h2><div id="sec">wird geprüft …</div>`;
  main.innerHTML = h + '</section>';
  main.onclick = async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.tab) { adminTab = d.tab; viewAdmin(); return; }
    if (d.arch != null) return importArchive(helpers());
    if (d.uadd != null || d.uedit) return userForm(D, d.uedit ? D.users.find(u => u.id === +d.uedit) : null);
    if (d.umany != null) return resetMany(D, $$('[data-usel]').filter(x => x.checked).map(x => +x.dataset.usel));
    if (d.ureset) { const u = D.users.find(x => x.id === +d.ureset); if (!confirm(`Neues Startpasswort für ${u.kuerzel}? Das bisherige Passwort gilt dann nicht mehr. Ihre Prüfungen öffnet die Lehrkraft danach mit ihrem Wiederherstellungscode.`)) return; const pw = K.startPassword(), salt = K.randomSalt(), { auth } = await K.fromPassword(pw, salt); await api('user_reset', { id: u.id, salt, auth }); showStartPw(u.kuerzel, pw); viewAdmin(); return; }
    if (d.udel) { const u = D.users.find(x => x.id === +d.udel); if (!confirm(`Konto ${u.kuerzel} mit allen Prüfungen löschen?`)) return; await api('user_delete', { id: u.id }).catch(e => toast('⚠ ' + esc(e.message))); viewAdmin(); return; }
    if (d.fsadd != null || d.fsedit) return fsForm(D, d.fsedit ? D.fachschaften.find(f => f.id === +d.fsedit) : null);
    if (d.fsauto != null) { // je angebotenem Fach ohne Fachschaft eine Fachschaft gleichen Namens
      const todo = D.faecher.filter(f => +f.aktiv && !f.fachschaft_id);
      if (!todo.length) { toast('Alle angebotenen Fächer gehören schon zu einer Fachschaft.'); return; }
      if (!confirm(`Für ${todo.length} ${todo.length === 1 ? 'Fach' : 'Fächer'} je eine Fachschaft anlegen?\n\n${todo.map(f => f.name).join(', ')}\n\nGrundlage sind die unter „Fächer“ angebotenen Fächer, die noch zu keiner Fachschaft gehören. Gibt es schon eine Fachschaft mit dem Namen des Fachs, kommt das Fach dorthin.`)) return;
      try { const r = await api('fachschaften_auto'); toast(`✓ ${r.created} Fachschaft${r.created === 1 ? '' : 'en'} angelegt${r.assigned > r.created ? `, ${r.assigned - r.created} ${r.assigned - r.created === 1 ? 'Fach' : 'Fächer'} zugeordnet` : ''}`); viewAdmin(); } catch (e) { toast('⚠ ' + esc(e.message)); }
      return;
    }
    if (d.fsdel) { if (!confirm('Fachschaft löschen? Die Fächer bleiben.')) return; await api('fachschaft_delete', { id: +d.fsdel }); viewAdmin(); return; }
    if (d.faadd != null || d.faren) { const f = d.faren ? D.faecher.find(x => x.id === +d.faren) : null; const n = prompt(f ? 'Neuer Name des Fachs' : 'Name des neuen Fachs', f?.name || ''); if (!n?.trim()) return; await api('fach_save', { id: f?.id, name: n.trim(), aktiv: f ? +f.aktiv : 1 }).catch(e => toast('⚠ ' + esc(e.message))); viewAdmin(); return; }
    if (d.cpurge != null) { try { const r = await purgeAll(helpers(), $('#pcr').checked); if (r) toast(`✓ Coaching-Daten gelöscht (${r.deleted} Coaching${r.deleted === 1 ? '' : 's'})`); } catch (e) { toast('⚠ ' + esc(e.message)); } return; }
    if (d.purge != null) {
      const sj = $('#pj').value;
      try { const r = await api('purge_exams', { confirm: $('#pc').value.trim(), schuljahr: sj }); toast(`✓ ${r.deleted} Prüfung${r.deleted === 1 ? '' : 'en'} gelöscht`); S.catalog = null; viewAdmin(); } catch (e) { toast('⚠ ' + esc(e.message)); }
    }
  };
  main.onchange = async ev => { const t = ev.target;
    if (t.id === 'uall' || t.dataset.usel) { // Auswahl für „Passwörter zurücksetzen“
      if (t.id === 'uall') $$('[data-usel]').forEach(x => { x.checked = t.checked; });
      const n = $$('[data-usel]').filter(x => x.checked).length, b = $('#umany');
      b.disabled = !n; b.textContent = n ? `🔑 Passwörter zurücksetzen (${n})` : '🔑 Passwörter zurücksetzen';
      $('#uall').checked = n && n === $$('[data-usel]').length; return;
    }
    if (t.dataset.faakt) { const f = D.faecher.find(x => x.id === +t.dataset.faakt); await api('fach_save', { id: f.id, name: f.name, aktiv: t.checked ? 1 : 0 }); f.aktiv = t.checked ? 1 : 0; S.catalog = null; } };
  if (adminTab === 'si') securityCheck();
}
async function securityCheck() {
  const box = $('#sec'); let r, direct = 0;
  try { r = await api('security_check'); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  try { direct = (await fetch('data/probe.sqlite', { cache: 'no-store' })).status; } catch (e) { }
  const okDb = direct !== 200;
  box.innerHTML = `<table class="t">
    <tr><td>Datenbank von außen abrufbar?</td><td>${okDb ? '<span class="chip good">nein ✓</span>' : '<span class="chip bad">JA – sofort beheben!</span>'}</td></tr>
    <tr><td>Datenordner</td><td>${r.inside_web ? '<span class="chip warn">im Web-Verzeichnis (per .htaccess gesperrt)</span>' : '<span class="chip good">außerhalb des Web-Verzeichnisses ✓</span>'}</td></tr>
    <tr><td>Verschlüsselte Verbindung (HTTPS)</td><td>${r.https ? '<span class="chip good">ja ✓</span>' : '<span class="chip bad">nein – nur mit HTTPS verwenden</span>'}</td></tr>
    <tr><td>PHP</td><td>${esc(r.php)}</td></tr></table>
    ${!okDb ? '<p class="err">Der Webserver liefert die Datenbank aus. Lege den Datenordner außerhalb des Web-Verzeichnisses (config.local.php) oder sperre ihn in der Server-Konfiguration.</p>' : ''}
    ${r.inside_web ? '<p class="help">Besser: Datenordner außerhalb des Web-Verzeichnisses. Dazu auf dem Webspace eine Datei config.local.php neben api.php anlegen: <code>&lt;?php return [\'data\' =&gt; \'/pfad/ausserhalb/probe-daten\'];</code></p>' : ''}`;
}
/** mehrere Lehrkräfte: neue Startpasswörter (im Browser erzeugt), dann Liste zum Kopieren und PDF zum Ausschneiden */
async function resetMany(D, ids) {
  const us = D.users.filter(u => ids.includes(u.id) && u.id !== S.user.id);
  if (!us.length) return;
  if (!confirm(`Neue Startpasswörter für ${us.length} ${us.length === 1 ? 'Lehrkraft' : 'Lehrkräfte'}?\n\n${us.map(u => u.kuerzel).join(', ')}\n\nDie bisherigen Passwörter gelten dann nicht mehr. Wer schon eingerichtet war, öffnet seine Prüfungen danach mit seinem Wiederherstellungscode.`)) return;
  const items = [];
  try {
    await withBusy(`Startpasswörter werden erzeugt … 0 / ${us.length}`, async () => {
      for (const u of us) {
        const pw = K.startPassword(), salt = K.randomSalt(), { auth } = await K.fromPassword(pw, salt);
        items.push({ u, pw, salt, auth }); const b = $('.busy span'); if (b) b.textContent = `Startpasswörter werden erzeugt … ${items.length} / ${us.length}`;
      }
      await api('user_reset_many', { items: items.map(x => ({ id: x.u.id, salt: x.salt, auth: x.auth })) });
    });
  } catch (e) { toast('⚠ ' + esc(e.message), 5000); return; }
  const url = location.origin + location.pathname, list = items.map(x => ({ kuerzel: x.u.kuerzel, name: x.u.name, pw: x.pw, had: !!+x.u.has_keys })), text = zugangText(list, url);
  viewAdmin();
  const d = dialog(`${list.length} neue Startpasswörter`, `<p>Nur jetzt sichtbar – bitte kopieren oder als PDF sichern, bevor du das Fenster schließt.</p>
    <textarea readonly rows="${Math.min(14, list.length + 6)}" style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre" id="zl">${esc(text)}</textarea>
    <p class="help">Das PDF enthält für jede Lehrkraft einen Zettel zum Ausschneiden (vier je Seite) mit Adresse, QR-Code, Nutzername und Startpasswort.</p>
    <div class="btns"><button class="btn" data-copy>📋 Liste kopieren</button><button class="btn" data-pdf>📄 PDF mit Zetteln</button><button class="btn pri" data-done>Fertig</button></div>`, { wide: true });
  $('[data-copy]', d.el).onclick = async () => { try { await navigator.clipboard.writeText(text); toast('✓ Liste kopiert'); } catch (e) { const ta = $('#zl', d.el); ta.focus(); ta.select(); toast('Text ist markiert – jetzt kopieren'); } };
  $('[data-pdf]', d.el).onclick = () => showPdf(zugangPdf(list, url), `Probe_Startpasswoerter_${new Date().toISOString().slice(0, 10)}.pdf`);
  $('[data-done]', d.el).onclick = () => { if (confirm('Fenster schließen? Die Startpasswörter lassen sich danach nicht mehr anzeigen.')) d.close(); };
}
function showStartPw(kuerzel, pw) {
  const d = dialog('Startpasswort', `<div class="printme stack"><p>Startpasswort für <b>${esc(kuerzel)}</b> – nur jetzt sichtbar:</p><div class="codebox">${esc(pw)}</div>
    <p class="help">Gib es der Lehrkraft persönlich. Beim ersten Anmelden legt sie ein eigenes Passwort fest und bekommt ihren Wiederherstellungscode. Anmeldung: ${esc(location.origin + location.pathname)}</p></div>
    <div class="btns"><button class="btn" data-pr>🖨 Drucken</button><button class="btn pri" data-close>Fertig</button></div>`);
  $('[data-pr]', d.el).onclick = () => print();
}
function userForm(D, u) {
  const d = dialog(u ? `Lehrkraft ${esc(u.kuerzel)}` : 'Neue Lehrkraft', `
    <div class="row">${field('Nutzername', `<input type="text" id="k" value="${esc(u?.kuerzel || '')}" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">`, 'Damit meldet sich die Lehrkraft an, z. B. ihr Kürzel.')}${field('Name', `<input type="text" id="n" value="${esc(u?.name || '')}" placeholder="optional">`)}</div>
    <div><b>Unterrichtet</b><div class="row" style="gap:0 12px">${D.faecher.filter(f => +f.aktiv || u?.faecher.includes(+f.id)).map(f => `<label class="ck"><input type="checkbox" data-uf="${f.id}"${u?.faecher.includes(+f.id) ? ' checked' : ''}>${esc(f.name)}</label>`).join('')}</div><span class="help">Nur diese Fächer stehen der Lehrkraft beim Anlegen einer Prüfung zur Wahl; weitere kann sie selbst ergänzen.</span></div>
    <label class="ck"><input type="checkbox" id="ad"${+u?.is_admin ? ' checked' : ''}>Admin (verwaltet Lehrkräfte, Fachschaften und Fächer)</label>
    <label class="ck"><input type="checkbox" id="be"${+u?.is_berater ? ' checked' : ''}>Schulberatung (erhält anonymisierte Coaching-Auswertungen der Klassleitungen)</label>
    <div><b>Fachleitung für</b>${D.fachschaften.length ? D.fachschaften.map(f => `<label class="ck"><input type="checkbox" data-fl="${f.id}"${u?.fachleitung.includes(+f.id) ? ' checked' : ''}>${esc(f.name)}</label>`).join('') : '<p class="help">Noch keine Fachschaften angelegt.</p>'}</div>
    ${u ? '' : '<p class="help">Probe erzeugt ein Startpasswort, das du der Lehrkraft gibst.</p>'}
    <div class="err" id="err"></div><button class="btn pri" id="go">${u ? 'Speichern' : 'Anlegen'}</button>`);
  $('#go', d.el).onclick = async () => {
    const data = { id: u?.id, kuerzel: $('#k', d.el).value.trim(), name: $('#n', d.el).value.trim(), is_admin: $('#ad', d.el).checked, is_berater: $('#be', d.el).checked, fachleitung: $$('[data-fl]', d.el).filter(x => x.checked).map(x => +x.dataset.fl), faecher: $$('[data-uf]', d.el).filter(x => x.checked).map(x => +x.dataset.uf) };
    try {
      let pw = null;
      if (!u) { pw = K.startPassword(); const salt = K.randomSalt(), { auth } = await withBusy('Startpasswort …', () => K.fromPassword(pw, salt)); Object.assign(data, { salt, auth }); }
      await api('user_save', data); d.close(); if (pw) showStartPw(data.kuerzel, pw); else toast('✓ gespeichert'); viewAdmin();
    } catch (er) { $('#err', d.el).textContent = er.message; }
  };
}
function fsForm(D, f) {
  const d = dialog(f ? `Fachschaft ${esc(f.name)}` : 'Neue Fachschaft', `${field('Name', `<input type="text" id="n" value="${esc(f?.name || '')}" placeholder="z. B. Physik oder Naturwissenschaften">`)}
    <div><b>Fächer dieser Fachschaft</b><div class="row" style="gap:0 12px">${D.faecher.map(x => `<label class="ck"><input type="checkbox" data-fa="${x.id}"${f && +x.fachschaft_id === +f.id ? ' checked' : ''}>${esc(x.name)}${x.fachschaft_id && (!f || +x.fachschaft_id !== +f.id) ? ` <span class="help">(${esc(D.fachschaften.find(y => +y.id === +x.fachschaft_id)?.name)})</span>` : ''}</label>`).join('')}</div></div>
    <p class="help">Ein Fach gehört zu genau einer Fachschaft. Die Fachleitung legst du bei der Lehrkraft fest.</p><div class="err" id="err"></div><button class="btn pri" id="go">Speichern</button>`, { wide: true });
  $('#go', d.el).onclick = async () => {
    try { await api('fachschaft_save', { id: f?.id, name: $('#n', d.el).value.trim(), faecher: $$('[data-fa]', d.el).filter(x => x.checked).map(x => +x.dataset.fa) }); d.close(); viewAdmin(); }
    catch (er) { $('#err', d.el).textContent = er.message; }
  };
}

boot();
