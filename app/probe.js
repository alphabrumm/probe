// Probe – Oberfläche: Einrichtung, Anmeldung, Prüfungen der Lehrkraft, Admin.
// Alles Persönliche (Schülernamen, Inhalte mit Lösungen) wird hier im Browser verschlüsselt, bevor es zum Server geht.
import * as K from './crypto.js';
import { viewLive, viewEval, stopLive } from './run.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const S = { user: null, csrf: '', keys: null, priv: null, catalog: null, sj: null };
const ARTEN = { Schulaufgabe: 'Schulaufgabe', Kurzarbeit: 'Kurzarbeit', AKL: 'AKL (angekündigter kleiner Leistungsnachweis)', 'Übungsprüfung': 'Übungsprüfung' };
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
  let st;
  try { st = await api('status'); } catch (e) { main.innerHTML = `<div class="center"><div class="card narrow"><h2>Probe ist nicht erreichbar</h2><p class="err">${esc(e.message)}</p></div></div>`; return; }
  S.csrf = st.csrf || ''; S.user = st.user; S.keys = st.keys;
  drawWho();
  if (st.setup) return viewSetup();
  if (!S.user) return viewLogin();
  if (S.user.must_setup) return viewKeySetup();
  if (!S.priv) return viewUnlock();
  route();
}
function drawWho() {
  const w = $('#who');
  if (!S.user || !S.priv) { w.innerHTML = ''; return; }
  w.innerHTML = `<span class="btns">${S.user.is_admin ? '<a class="btn sm ghost" href="#/admin">Admin</a>' : ''}<button class="btn sm" id="bMe">${esc(S.user.kuerzel)} ▾</button></span>`;
  $('#bMe').onclick = () => {
    const d = dialog(esc(S.user.name || S.user.kuerzel), `<div class="help">Angemeldet als <b>${esc(S.user.kuerzel)}</b>${S.user.is_admin ? ' · Admin' : ''}${S.user.fachleitung.length ? ' · Fachleitung ' + S.user.fachleitung.map(f => esc(f.name)).join(', ') : ''}</div>
      <div class="btns"><button class="btn" data-fa>Meine Fächer</button><button class="btn" data-pw>Passwort ändern</button><button class="btn" data-out>Abmelden</button></div>`);
    d.el.onclick = async e => {
      if (e.target.closest('[data-out]')) { await api('logout').catch(() => { }); S.user = null; S.priv = null; S.csrf = ''; d.close(); location.hash = '#/'; boot(); }
      if (e.target.closest('[data-pw]')) { d.close(); changePassword(); }
      if (e.target.closest('[data-fa]')) { d.close(); myFaecher(); }
    };
  };
}
addEventListener('hashchange', () => { if (S.user && S.priv) route(); });
function route() {
  drawWho();
  const h = location.hash.replace(/^#/, '') || '/';
  let m;
  if (h === '/admin' && S.user.is_admin) return viewAdmin();
  if ((m = h.match(/^\/p\/(\d+)$/))) return viewExam(+m[1]);
  return viewDashboard();
}

/* ---------- Einrichtung, Anmeldung, Schlüssel ---------- */
function viewSetup() {
  main.innerHTML = `<div class="center"><div class="card narrow stack"><img class="hero-ic" src="app/icon.svg" alt=""><h1 class="tc">Probe einrichten</h1>
    <p class="help tc">Das erste Konto ist das Admin-Konto. Damit legst du danach Lehrkräfte, Fachschaften und Fächer an.</p>
    ${field('Kürzel', '<input type="text" id="k" autocapitalize="characters" autocomplete="username">', 'Das Kürzel ist der Login.')}
    ${field('Name (optional)', '<input type="text" id="n" autocomplete="name">')}
    ${field('Passwort', '<input type="password" id="p1" autocomplete="new-password">', 'Mindestens 10 Zeichen.')}
    ${field('Passwort wiederholen', '<input type="password" id="p2" autocomplete="new-password">')}
    <div class="err" id="err"></div><button class="btn pri" id="go">Einrichten</button></div></div>`;
  $('#go').onclick = async () => {
    const k = $('#k').value.trim(), p1 = $('#p1').value, p2 = $('#p2').value, e = pwRules(p1, p2);
    if (!k) { $('#err').textContent = 'Bitte ein Kürzel eintragen.'; return; }
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
  main.innerHTML = `<div class="center"><form class="card narrow stack" id="f"><img class="hero-ic" src="app/icon.svg" alt=""><h1 class="tc">Probe</h1><p class="help tc">Digitale Prüfungen – Anmeldung für Lehrkräfte</p>
    ${field('Kürzel', '<input type="text" id="k" autocapitalize="characters" autocomplete="username" required>')}
    ${field('Passwort', '<input type="password" id="p" autocomplete="current-password" required>')}
    <div class="err" id="err"></div><button class="btn pri">Anmelden</button>
    <p class="help tc">Passwort vergessen? Der Admin setzt ein neues Startpasswort. Deine Prüfungen öffnest du danach mit deinem Wiederherstellungscode.</p></form></div>`;
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
  let C, L;
  try { C = await catalog(); L = (await api('exam_list', { schuljahr: S.sj })).exams; } catch (e) { main.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const by = {}; for (const e of L) (by[e.klasse] = by[e.klasse] || []).push(e);
  const klassen = Object.keys(by).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  main.innerHTML = `<h1>Meine Prüfungen</h1><p class="sub">Schuljahr ${esc(S.sj)} · nach Klassen</p>
    <div class="bar"><select id="sj" style="width:auto">${C.schuljahre.map(s => `<option${s === S.sj ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select><span class="sp"></span><button class="btn pri" id="neu">＋ Neue Prüfung</button></div>
    ${klassen.length ? klassen.map(k => `<div class="klasse"><h2>${esc(k)}</h2><span class="help">${by[k].length} Prüfung${by[k].length === 1 ? '' : 'en'}</span></div><div class="tiles">${by[k].map(e => `<a class="tile" href="#/p/${e.id}"><span class="k">${esc(e.fach)} · ${esc(e.art)}</span><span class="t">${esc(e.titel || 'ohne Titel')}</span><span class="m">${esc(fmtDate(e.datum))}${e.dauer ? ` · ${e.dauer} min` : ''}${e.erwartet ? ` · ${e.erwartet} Teilnehmer` : ''}</span><span class="s">${statusChip(e)}</span></a>`).join('')}</div>`).join('')
      : `<div class="empty"><img src="app/icon.svg" alt=""><h2>Noch keine Prüfung in ${esc(S.sj)}</h2><p>Lege eine Prüfung an: Klasse, Fach, Datum, Art – den Inhalt baust du danach mit PathFinder.</p></div>`}`;
  $('#sj').onchange = e => { S.sj = e.target.value; viewDashboard(); };
  $('#neu').onclick = () => examForm(null);
}

/* ---------- Prüfung anlegen und Rahmenbedingungen ---------- */
async function examForm(e) {
  const C = await catalog();
  const klassen = [...new Set((await api('exam_list', { schuljahr: S.sj })).exams.map(x => x.klasse))];
  const F = [...C.faecher]; if (e?.fach_id && !F.some(f => +f.id === +e.fach_id)) F.push({ id: e.fach_id, name: e.fach });
  const v = e || { klasse: '', fach_id: F[0]?.id, datum: new Date().toISOString().slice(0, 10), art: 'Schulaufgabe', erwartet: 0, dauer: 45, pin_on: true, skala: 'noten' };
  const d = dialog(e ? 'Rahmenbedingungen' : 'Neue Prüfung', `
    <div class="row">${field('Klasse', `<input type="text" id="kl" list="kll" value="${esc(v.klasse)}" placeholder="z. B. 8b" autocapitalize="off"><datalist id="kll">${klassen.map(k => `<option value="${esc(k)}">`).join('')}</datalist>`)}
    ${field('Fach', `<select id="fa">${F.map(f => `<option value="${f.id}"${+f.id === +v.fach_id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`, C.eigene ? 'Deine Fächer – weitere über dein Kürzel oben rechts → Meine Fächer.' : 'Lege über dein Kürzel oben rechts → Meine Fächer fest, welche Fächer du unterrichtest.')}</div>
    <div class="row">${field('Datum', `<input type="date" id="da" value="${esc(v.datum)}">`)}${field('Art', `<select id="ar">${Object.entries(ARTEN).map(([k, n]) => `<option value="${esc(k)}"${k === v.art ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`)}</div>
    <div class="row">${field('Bearbeitungszeit (Minuten)', `<input type="number" id="du" min="0" max="600" inputmode="numeric" value="${v.dauer || ''}" placeholder="45">`, 'Leer = ohne Countdown.')}
    ${field('Erwartete Teilnehmer', `<input type="number" id="er" min="0" max="200" inputmode="numeric" value="${v.erwartet || ''}" placeholder="z. B. 28">`, 'Mit Klassenliste automatisch.')}</div>
    ${field('Bewertung', `<select id="sk"><option value="noten"${v.skala !== 'punkte' ? ' selected' : ''}>Noten 1–6</option><option value="punkte"${v.skala === 'punkte' ? ' selected' : ''}>Punkte 0–15 (Oberstufe)</option></select>`)}
    <label class="ck"><input type="checkbox" id="pin"${v.pin_on ? ' checked' : ''}>Einlass-PIN: Schüler geben zusätzlich zum QR-Code eine PIN ein, die nur am Beamer steht.</label>
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">${e ? 'Speichern' : 'Anlegen und Inhalt bauen'}</button></div>`);
  $('#go', d.el).onclick = async () => {
    const data = { id: e?.id, klasse: $('#kl', d.el).value.trim(), fach_id: +$('#fa', d.el).value, datum: $('#da', d.el).value, art: $('#ar', d.el).value, dauer: +$('#du', d.el).value || 0, erwartet: +$('#er', d.el).value || 0, skala: $('#sk', d.el).value, pin_on: $('#pin', d.el).checked };
    if (!data.klasse) { $('#err', d.el).textContent = 'Bitte die Klasse eintragen.'; return; }
    try {
      const r = await api('exam_save', data); d.close(); S.catalog = null;
      if (e) { toast('✓ gespeichert'); viewExam(e.id); }
      else { S.sj = r.exam.schuljahr; location.hash = '#/p/' + r.exam.id; openEditor(r.exam, null); }
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
  const H = { S, api, K, dialog, toast, withBusy, esc, fmtDate, fmtPts, field, main, pickFile, viewExam };
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
      <section class="card"><h2>Klassenliste</h2>
        ${R.length ? `<p>${R.length} Schüler · während der Prüfung siehst du, wer fehlt.</p><ul class="names">${R.map(s => `<li>${esc(s.n)}, ${esc(s.v)}</li>`).join('')}</ul>` : '<p class="help">Optional: Mit einer Liste der Vor- und Nachnamen erkennt Probe, wer bei der Prüfung fehlt. Die Namen werden verschlüsselt gespeichert.</p>'}
        <div class="btns" style="margin-top:10px"><button class="btn" id="csv">⤒ CSV-Datei wählen</button><button class="btn" id="paste">Namen einfügen</button>${R.length ? '<button class="btn danger" id="rdel">Liste entfernen</button>' : ''}</div></section>
    </div><div class="cards">
      <section class="card"><h2>Rahmenbedingungen</h2>
        <table class="t"><tr><td>Klasse</td><td><b>${esc(e.klasse)}</b></td></tr><tr><td>Fach</td><td><b>${esc(e.fach)}</b></td></tr><tr><td>Datum</td><td><b>${esc(fmtDate(e.datum))}</b></td></tr><tr><td>Art</td><td><b>${esc(ARTEN[e.art] || e.art)}</b></td></tr>
        <tr><td>Bearbeitungszeit</td><td><b>${e.dauer ? e.dauer + ' min' : 'ohne Countdown'}</b></td></tr><tr><td>Teilnehmer</td><td><b>${e.erwartet || '–'}</b></td></tr><tr><td>Einlass-PIN</td><td><b>${e.pin_on ? 'an' : 'aus'}</b></td></tr><tr><td>Bewertung</td><td><b>${e.skala === 'punkte' ? 'Punkte 0–15' : 'Noten 1–6'}</b></td></tr></table>
        <div class="btns" style="margin-top:12px"><button class="btn" id="meta">Ändern</button></div></section>
      <section class="card"><h2>Durchführung</h2><p class="help">${e.fertig ? 'Beim Start bekommt die Prüfung einen QR-Code' + (e.pin_on ? ' und eine PIN' : '') + '. Danach lässt sich der Inhalt nicht mehr ändern.' : 'Erst den Inhalt fertigstellen (im Editor „✓ Fertig – zurück zu Probe“).'}</p><button class="btn pri" id="start"${e.fertig ? '' : ' disabled'}>▶ Prüfung starten</button></section>
      <section class="card"><h2>Löschen</h2><p class="help">Löscht die Prüfung mit Inhalt und Klassenliste endgültig.</p><button class="btn danger" id="del">Prüfung löschen</button></section>
    </div></div>`;
  $('#edit').onclick = () => openEditor(e, e.draft);
  $('#start').onclick = async () => {
    if (!confirm(`Prüfung ${e.klasse} · ${e.fach} jetzt starten? Schüler können sich dann per QR-Code anmelden.`)) return;
    try { await api('exam_state', { id: e.id, to: 'offen' }); viewExam(e.id); } catch (er) { toast('⚠ ' + esc(er.message), 5000); }
  };
  $('#meta').onclick = () => examForm(e);
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
  $('#rdel') && ($('#rdel').onclick = async () => { if (!confirm('Klassenliste entfernen?')) return; await api('exam_roster', { id: e.id, roster_enc: null, roster_n: 0 }); viewExam(e.id); });
  $('#del').onclick = async () => { if (!confirm(`Prüfung ${e.klasse} · ${e.fach} vom ${fmtDate(e.datum)} endgültig löschen?`)) return; await api('exam_delete', { id: e.id }); toast('Prüfung gelöscht'); location.hash = '#/'; };
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
async function saveRoster(e, L) {
  if (!L.length) { toast('⚠ Keine Namen erkannt'); return; }
  await withBusy('Klassenliste wird verschlüsselt …', async () => api('exam_roster', { id: e.id, roster_enc: await K.seal(S.keys.pub_key, L), roster_n: L.length }));
  toast(`✓ ${L.length} Namen übernommen`); viewExam(e.id);
}

/* ---------- Inhalt: PathFinder eingebettet ---------- */
const EXAM_TYPES = new Set(['task', 'quiz', 'gap', 'match', 'essay']);
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
function openEditor(e, doc) {
  const wrap = document.createElement('div'); wrap.className = 'editor';
  // Vorgaben für den KI-Dialog in PathFinder: Fach, Jahrgangsstufe (aus der Klasse), Umfang (Bearbeitungszeit), Kopfzeile
  const q = new URLSearchParams({ fach: e.fach, klasse: e.klasse, kopf: `${e.fach} · ${e.klasse} · ${e.art}` }); if (e.dauer) q.set('min', e.dauer);
  wrap.innerHTML = `<iframe src="editor.html?${esc(q.toString())}" title="Prüfung bearbeiten"></iframe>`;
  document.body.appendChild(wrap); document.body.style.overflow = 'hidden';
  const fr = $('iframe', wrap);
  let timer = null, pending = null, saving = Promise.resolve();
  const flush = () => { clearTimeout(timer); timer = null; if (!pending) return saving; const d = pending; pending = null; saving = saving.then(() => saveDraft(e.id, d)).catch(er => toast('⚠ Speichern fehlgeschlagen: ' + esc(er.message), 5000)); return saving; };
  const close = () => { wrap.remove(); document.body.style.overflow = ''; cleanLocal(); viewExam(e.id); };
  const start = () => {
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
  if (adminTab === 'lk') h += `<div class="bar"><h2 style="margin:0">Lehrkräfte</h2><span class="sp"></span><button class="btn pri" data-uadd>＋ Lehrkraft</button></div><div class="scroll-x"><table class="t"><tr><th>Kürzel</th><th>Name</th><th>Fächer</th><th>Rollen</th><th>Status</th><th></th></tr>
    ${D.users.map(u => `<tr><td><b>${esc(u.kuerzel)}</b></td><td>${esc(u.name)}</td><td class="help">${D.faecher.filter(f => u.faecher.includes(+f.id)).map(f => esc(f.name)).join(', ') || '–'}</td><td><span class="fl">${+u.is_admin ? '<span class="chip">Admin</span>' : ''}${u.fachleitung.map(f => `<span class="chip">Fachleitung ${esc(FS[f]?.name)}</span>`).join('')}</span></td>
    <td>${+u.must_setup ? '<span class="chip warn">Startpasswort</span>' : '<span class="chip good">eingerichtet</span>'}</td><td class="act"><button class="btn sm" data-uedit="${u.id}">Bearbeiten</button> <button class="btn sm" data-ureset="${u.id}">Startpasswort</button> <button class="btn sm danger" data-udel="${u.id}" ${u.id === S.user.id ? 'disabled' : ''}>Löschen</button></td></tr>`).join('')}</table></div>`;
  if (adminTab === 'fs') h += `<div class="bar"><h2 style="margin:0">Fachschaften</h2><span class="sp"></span><button class="btn pri" data-fsadd>＋ Fachschaft</button></div>
    ${D.fachschaften.length ? `<table class="t"><tr><th>Fachschaft</th><th>Fächer</th><th>Fachleitung</th><th></th></tr>${D.fachschaften.map(f => `<tr><td><b>${esc(f.name)}</b></td><td><span class="fl">${D.faecher.filter(x => +x.fachschaft_id === +f.id).map(x => `<span class="chip">${esc(x.name)}</span>`).join('') || '<span class="help">keine</span>'}</span></td><td>${D.users.filter(u => u.fachleitung.includes(+f.id)).map(u => esc(u.kuerzel)).join(', ') || '<span class="help">keine</span>'}</td><td class="act"><button class="btn sm" data-fsedit="${f.id}">Bearbeiten</button> <button class="btn sm danger" data-fsdel="${f.id}">Löschen</button></td></tr>`).join('')}</table>` : '<p class="help">Noch keine Fachschaft. Eine Fachschaft (z. B. „Physik“ oder „Naturwissenschaften“) bündelt Fächer; ihre Fachleitung bekommt die Prüfungen zur Respizienz.</p>'}`;
  if (adminTab === 'fa') h += `<div class="bar"><h2 style="margin:0">Fächer</h2><span class="sp"></span><button class="btn pri" data-faadd>＋ Fach</button></div><p class="help">Vorbelegt nach LehrplanPLUS Gymnasium Bayern. Ausgeblendete Fächer stehen beim Anlegen einer Prüfung nicht zur Wahl.</p>
    <table class="t"><tr><th>Fach</th><th>Fachschaft</th><th>angeboten</th><th></th></tr>${D.faecher.map(f => `<tr><td><b>${esc(f.name)}</b></td><td>${esc(FS[f.fachschaft_id]?.name || '–')}</td><td><label class="ck"><input type="checkbox" data-faakt="${f.id}"${+f.aktiv ? ' checked' : ''}></label></td><td class="act"><button class="btn sm" data-faren="${f.id}">Umbenennen</button></td></tr>`).join('')}</table>`;
  if (adminTab === 'je') h += `<h2>Schuljahresende</h2><p>Prüfungen werden nur ein Jahr aufbewahrt. Hier löschst du alle Prüfungen eines Schuljahres – oder alle. Konten, Fachschaften und Fächer bleiben.</p>
    ${D.exams.length ? `<table class="t"><tr><th>Schuljahr</th><th>Prüfungen</th></tr>${D.exams.map(x => `<tr><td>${esc(x.schuljahr)}</td><td>${x.n}</td></tr>`).join('')}</table>` : '<p class="help">Es sind keine Prüfungen gespeichert.</p>'}
    <div class="row" style="margin-top:14px">${field('Löschen', `<select id="pj"><option value="">alle Prüfungen</option>${D.exams.map(x => `<option>${esc(x.schuljahr)}</option>`).join('')}</select>`)}${field('Zur Bestätigung LÖSCHEN eintippen', '<input type="text" id="pc" autocapitalize="characters" autocomplete="off">')}</div>
    <div class="btns" style="margin-top:12px"><button class="btn danger" data-purge>Endgültig löschen</button></div>`;
  if (adminTab === 'si') h += `<h2>Sicherheit</h2><div id="sec">wird geprüft …</div>`;
  main.innerHTML = h + '</section>';
  main.onclick = async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.tab) { adminTab = d.tab; viewAdmin(); return; }
    if (d.uadd != null || d.uedit) return userForm(D, d.uedit ? D.users.find(u => u.id === +d.uedit) : null);
    if (d.ureset) { const u = D.users.find(x => x.id === +d.ureset); if (!confirm(`Neues Startpasswort für ${u.kuerzel}? Das bisherige Passwort gilt dann nicht mehr. Ihre Prüfungen öffnet die Lehrkraft danach mit ihrem Wiederherstellungscode.`)) return; const pw = K.startPassword(), salt = K.randomSalt(), { auth } = await K.fromPassword(pw, salt); await api('user_reset', { id: u.id, salt, auth }); showStartPw(u.kuerzel, pw); viewAdmin(); return; }
    if (d.udel) { const u = D.users.find(x => x.id === +d.udel); if (!confirm(`Konto ${u.kuerzel} mit allen Prüfungen löschen?`)) return; await api('user_delete', { id: u.id }).catch(e => toast('⚠ ' + esc(e.message))); viewAdmin(); return; }
    if (d.fsadd != null || d.fsedit) return fsForm(D, d.fsedit ? D.fachschaften.find(f => f.id === +d.fsedit) : null);
    if (d.fsdel) { if (!confirm('Fachschaft löschen? Die Fächer bleiben.')) return; await api('fachschaft_delete', { id: +d.fsdel }); viewAdmin(); return; }
    if (d.faadd != null || d.faren) { const f = d.faren ? D.faecher.find(x => x.id === +d.faren) : null; const n = prompt(f ? 'Neuer Name des Fachs' : 'Name des neuen Fachs', f?.name || ''); if (!n?.trim()) return; await api('fach_save', { id: f?.id, name: n.trim(), aktiv: f ? +f.aktiv : 1 }).catch(e => toast('⚠ ' + esc(e.message))); viewAdmin(); return; }
    if (d.purge != null) {
      const sj = $('#pj').value;
      try { const r = await api('purge_exams', { confirm: $('#pc').value.trim(), schuljahr: sj }); toast(`✓ ${r.deleted} Prüfung${r.deleted === 1 ? '' : 'en'} gelöscht`); S.catalog = null; viewAdmin(); } catch (e) { toast('⚠ ' + esc(e.message)); }
    }
  };
  main.onchange = async ev => { const t = ev.target; if (t.dataset.faakt) { const f = D.faecher.find(x => x.id === +t.dataset.faakt); await api('fach_save', { id: f.id, name: f.name, aktiv: t.checked ? 1 : 0 }); f.aktiv = t.checked ? 1 : 0; S.catalog = null; } };
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
function showStartPw(kuerzel, pw) {
  const d = dialog('Startpasswort', `<div class="printme stack"><p>Startpasswort für <b>${esc(kuerzel)}</b> – nur jetzt sichtbar:</p><div class="codebox">${esc(pw)}</div>
    <p class="help">Gib es der Lehrkraft persönlich. Beim ersten Anmelden legt sie ein eigenes Passwort fest und bekommt ihren Wiederherstellungscode. Anmeldung: ${esc(location.origin + location.pathname)}</p></div>
    <div class="btns"><button class="btn" data-pr>🖨 Drucken</button><button class="btn pri" data-close>Fertig</button></div>`);
  $('[data-pr]', d.el).onclick = () => print();
}
function userForm(D, u) {
  const d = dialog(u ? `Lehrkraft ${esc(u.kuerzel)}` : 'Neue Lehrkraft', `
    <div class="row">${field('Kürzel', `<input type="text" id="k" value="${esc(u?.kuerzel || '')}" autocapitalize="characters" autocomplete="off">`, 'Das Kürzel ist der Login.')}${field('Name', `<input type="text" id="n" value="${esc(u?.name || '')}" placeholder="optional">`)}</div>
    <div><b>Unterrichtet</b><div class="row" style="gap:0 12px">${D.faecher.filter(f => +f.aktiv || u?.faecher.includes(+f.id)).map(f => `<label class="ck"><input type="checkbox" data-uf="${f.id}"${u?.faecher.includes(+f.id) ? ' checked' : ''}>${esc(f.name)}</label>`).join('')}</div><span class="help">Nur diese Fächer stehen der Lehrkraft beim Anlegen einer Prüfung zur Wahl; weitere kann sie selbst ergänzen.</span></div>
    <label class="ck"><input type="checkbox" id="ad"${+u?.is_admin ? ' checked' : ''}>Admin (verwaltet Lehrkräfte, Fachschaften und Fächer)</label>
    <div><b>Fachleitung für</b>${D.fachschaften.length ? D.fachschaften.map(f => `<label class="ck"><input type="checkbox" data-fl="${f.id}"${u?.fachleitung.includes(+f.id) ? ' checked' : ''}>${esc(f.name)}</label>`).join('') : '<p class="help">Noch keine Fachschaften angelegt.</p>'}</div>
    ${u ? '' : '<p class="help">Probe erzeugt ein Startpasswort, das du der Lehrkraft gibst.</p>'}
    <div class="err" id="err"></div><button class="btn pri" id="go">${u ? 'Speichern' : 'Anlegen'}</button>`);
  $('#go', d.el).onclick = async () => {
    const data = { id: u?.id, kuerzel: $('#k', d.el).value.trim(), name: $('#n', d.el).value.trim(), is_admin: $('#ad', d.el).checked, fachleitung: $$('[data-fl]', d.el).filter(x => x.checked).map(x => +x.dataset.fl), faecher: $$('[data-uf]', d.el).filter(x => x.checked).map(x => +x.dataset.uf) };
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
