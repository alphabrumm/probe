// Probe – Coaching, Schülerseite: Fragebogen vor dem Coachinggespräch. Nur mit persönlichem QR-Code.
// Name und Antworten verschlüsselt dieses Gerät mit dem öffentlichen Schlüssel der Klassleitung – nur sie kann sie lesen.
// Nichts bleibt dauerhaft auf dem Gerät: ein Entwurf liegt nur bis zum Schließen des Tabs im sessionStorage.
import './icons.js';
import * as K from './crypto.js';
import { VORLAGEN, formHtml, readForm, answered, questions } from './cvorlagen.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const code = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const PK = 'probe.cp.' + code, DK = 'probe.cd.' + code;
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
function readPersonal(h) {
  const m = String(h || '').match(/[#&]p=([A-Za-z0-9_-]+)/); if (!m) return null;
  try { const o = JSON.parse(new TextDecoder().decode(unb64u(m[1]))); return o && typeof o.t === 'string' ? { v: String(o.v || ''), n: String(o.n || ''), t: o.t.slice(0, 64) } : null; } catch (e) { return null; }
}
let me = readPersonal(location.hash);
try { if (me) sessionStorage.setItem(PK, JSON.stringify(me)); else me = JSON.parse(sessionStorage.getItem(PK) || 'null'); } catch (e) { }
if (location.hash) history.replaceState(null, '', location.pathname + location.search); // Name und Schlüssel nicht in der Adresszeile stehen lassen
const card = html => { main.innerHTML = `<div class="card">${html}</div>`; };

async function api(a, data = {}) {
  let r, j;
  try { r = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, code, ...data }), cache: 'no-store' }); j = await r.json(); }
  catch (e) { throw new Error('Keine Verbindung zum Server. Prüfe das WLAN und versuche es noch einmal.'); }
  if (!j.ok) throw new Error(j.error || 'Fehler');
  return j;
}
const tidOf = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('probe-coaching|' + t)))].map(x => x.toString(16).padStart(2, '0')).join('');

async function boot() {
  if (!window.isSecureContext || !crypto?.subtle) { card('<h2>Diese Seite braucht HTTPS</h2><p>Bitte gib deiner Lehrkraft Bescheid: Die Adresse muss mit <b>https://</b> beginnen.</p>'); return; }
  if (!code || !me) { card('<h2>Persönlicher QR-Code nötig</h2><p>Scanne den QR-Code auf deinem Blatt. Er gehört nur dir – gib ihn nicht weiter.</p>'); return; }
  let info;
  try { info = await api('c_info'); } catch (e) { card(`<h2>Das hat nicht geklappt</h2><p class="err">${esc(e.message)}</p>`); return; }
  if (!info.open) { card(`<h2>Der Fragebogen ist geschlossen</h2><p>Sprich mit ${esc(info.lehrkraft)}, wenn du ihn noch ausfüllen möchtest.</p>`); return; }
  const tpl = info.spec || VORLAGEN[info.vorlage]; if (!tpl || !info.pub_key) { card('<h2>Dieser Fragebogen ist nicht eingerichtet.</h2>'); return; }
  let draft = {}; try { draft = JSON.parse(sessionStorage.getItem(DK) || '{}'); } catch (e) { }
  $('#lock').hidden = false;
  main.innerHTML = `<h1 style="margin:4px 0 4px">Hallo ${esc(me.v || me.n)}!</h1>
    <p class="sub">${esc(info.titel || 'Lerncoaching')} · Klasse ${esc(info.klasse)} · bei ${esc(info.lehrkraft)}</p>
    <div class="card" style="margin-bottom:14px"><b>${esc(tpl.head.replace('LERNCOACHING | ', ''))}</b> – ${esc(tpl.sub)}<br>
    <span class="help">🔒 Deine Antworten werden schon auf diesem Gerät verschlüsselt. Nur ${esc(info.lehrkraft)} kann sie lesen. Du musst nicht alles beantworten.</span></div>
    <form class="cform" id="f" autocomplete="off">${formHtml(tpl, draft)}</form>
    <div class="err" id="err" style="margin-top:12px"></div>
    <div class="btns" style="margin-top:14px"><button class="btn pri" id="send">Abschicken</button><span class="help" id="cnt"></span></div>`;
  const f = $('#f'), cnt = () => { $('#cnt').textContent = `${answered(tpl, readForm(f, tpl))} von ${questions(tpl).length} Fragen beantwortet`; };
  cnt();
  f.addEventListener('input', () => { try { sessionStorage.setItem(DK, JSON.stringify(readForm(f, tpl))); } catch (e) { } cnt(); });
  f.addEventListener('submit', e => e.preventDefault());
  $('#send').onclick = async () => {
    const v = readForm(f, tpl);
    if (!answered(tpl, v) && !confirm('Du hast noch nichts ausgefüllt. Trotzdem abschicken?')) return;
    const b = $('#send'); b.disabled = true; b.textContent = 'wird verschlüsselt …'; $('#err').textContent = '';
    try {
      const tid = await tidOf(me.t);
      await api('c_submit', { tid, identity_enc: await K.seal(info.pub_key, { v: me.v, n: me.n, t: me.t }), answers_enc: await K.seal(info.pub_key, { vorlage: tpl.id, answers: v, at: Date.now() }) });
      try { sessionStorage.removeItem(DK); sessionStorage.removeItem(PK); } catch (e) { }
      card(`<h2>Danke, ${esc(me.v || me.n)}! ✓</h2><p>Deine Antworten sind verschlüsselt bei ${esc(info.lehrkraft)} angekommen. Ihr sprecht im Coachinggespräch darüber.</p>
        <p class="help">Willst du noch etwas ändern? Scanne deinen QR-Code noch einmal und schicke den Bogen neu ab – der neue ersetzt den alten.</p><p class="help">Du kannst diese Seite jetzt schließen.</p>`);
      me = null;
    } catch (e) { $('#err').textContent = e.message; b.disabled = false; b.textContent = 'Noch einmal abschicken'; }
  };
}
boot();
