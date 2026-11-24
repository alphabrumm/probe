// Probe – Umfrage, Seite der Teilnehmenden (ohne Anmeldung). Der Fragebogen läuft im PathFinder-Player (Stil Lumi).
// Die Antworten verschlüsselt dieses Gerät mit dem öffentlichen Schlüssel der Lehrkraft – nur sie kann sie lesen.
// Anonyme Umfragen schicken weder Namen noch Uhrzeit mit. Nichts bleibt dauerhaft auf dem Gerät: ein Entwurf liegt nur
// bis zum Schließen des Tabs im sessionStorage; nach dem Abschicken wird alles entfernt. In IndexedDB steht nur, dass
// dieses Gerät an einer anonymen Umfrage schon teilgenommen hat (gegen versehentliches doppeltes Ausfüllen).
import * as K from './crypto.js';
import { startPathFinder, LUMI_OWL, LUMI_STARS } from '../vendor/pathfinder/core/pathfinder.js';
import { answersFromSvy } from '../vendor/pathfinder/core/pfsurvey.js';
import { idbPut, idbAll } from './idb.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const screen = $('#screen');
document.documentElement.style.setProperty('--lumi-stars', `url(${LUMI_STARS})`);
const code = (new URLSearchParams(location.search).get('u') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const PK = 'probe.up.' + code, DK = 'probe.ud.' + code;
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
function readPersonal(h) {
  const m = String(h || '').match(/[#&]p=([A-Za-z0-9_-]+)/); if (!m) return null;
  try { const o = JSON.parse(new TextDecoder().decode(unb64u(m[1]))); return o && typeof o.t === 'string' ? { v: String(o.v || ''), n: String(o.n || ''), t: o.t.slice(0, 64) } : null; } catch (e) { return null; }
}
let me = readPersonal(location.hash);
try { if (me) sessionStorage.setItem(PK, JSON.stringify(me)); else me = JSON.parse(sessionStorage.getItem(PK) || 'null'); } catch (e) { }
if (location.hash) history.replaceState(null, '', location.pathname + location.search); // Code nicht in der Adresszeile stehen lassen
const card = html => { $('#app').hidden = true; screen.hidden = false; screen.innerHTML = `<div class="card"><img class="owl" src="${LUMI_OWL}" alt="">${html}</div>`; };

async function api(a, data = {}) {
  let r, j;
  try { r = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, code, ...data }), cache: 'no-store' }); j = await r.json(); }
  catch (e) { throw new Error('Keine Verbindung zum Server. Prüfe das WLAN und versuche es noch einmal.'); }
  if (!j.ok) { const er = new Error(j.error || 'Fehler'); er.status = r.status; throw er; }
  return j;
}
const tidOf = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('probe-umfrage|' + t)))].map(x => x.toString(16).padStart(2, '0')).join('');
const doneKey = 'ud|' + code;
const wasDone = async () => { try { return (await idbAll()).some(e => e.k === doneKey); } catch (e) { return false; } };
let docId = '';
const cleanup = () => {
  try { sessionStorage.removeItem(DK); sessionStorage.removeItem(PK); } catch (e) { }
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('probe-u.') || (docId && k === 'pathfinder.fortschritt.' + docId)) localStorage.removeItem(k); } catch (e) { } // Reste des Players (besuchte Stationen)
};

async function boot() {
  if (!window.isSecureContext || !crypto?.subtle) { card('<h2>Diese Seite braucht HTTPS</h2><p>Bitte gib deiner Lehrkraft Bescheid: Die Adresse muss mit <b>https://</b> beginnen.</p>'); return; }
  if (!code) { card('<h2>QR-Code nötig</h2><p>Scanne den QR-Code der Umfrage.</p>'); return; }
  let info;
  try { info = await api('u_info'); } catch (e) { card(`<h2>Das hat nicht geklappt</h2><p class="err">${esc(e.message)}</p>`); return; }
  if (info.mode !== 'tafel' && !me) { card('<h2>Persönlicher QR-Code nötig</h2><p>Für diese Umfrage hat jede:r einen eigenen QR-Code bekommen. Scanne deinen Code auf dem Zettel.</p>'); return; }
  if (!info.open || !info.doc) { card(info.ended ? `<h2>Die Umfrage ist beendet</h2><p>Danke an alle, die mitgemacht haben!</p>` : `<h2>Die Umfrage ist gerade nicht geöffnet</h2><p>Warte, bis ${esc(info.lehrkraft)} sie startet, und scanne den QR-Code dann noch einmal.</p>`); return; }
  if (!info.pub_key) { card('<h2>Diese Umfrage ist nicht eingerichtet.</h2>'); return; }
  const intro = () => {
    const who = info.mode === 'name' ? `<p>Hallo <b>${esc(me.v || me.n)}</b>! ${esc(info.lehrkraft)} sieht deinen Namen bei deinen Antworten.</p>`
      : info.mode === 'einmal' ? '<p>Die Umfrage ist <b>anonym</b>: Deine Antworten werden ohne deinen Code gespeichert. Dein Code gilt nur einmal.</p>'
      : '<p>Die Umfrage ist <b>anonym</b>: Niemand sieht, wer was geantwortet hat.</p>';
    card(`<h1>${esc(info.titel || 'Umfrage')}</h1><p class="help">${esc([info.gruppe, info.lehrkraft].filter(Boolean).join(' · '))}</p>${who}
      <p class="lock">🔒 Deine Antworten werden schon auf diesem Gerät verschlüsselt – lesen kann sie nur ${esc(info.lehrkraft)}.</p><p class="help">Du musst nicht alles beantworten.</p>
      <button class="btn" id="go">Los geht's</button>`);
    $('#go').onclick = run;
  };
  if (info.mode === 'tafel' && await wasDone()) {
    card(`<h2>Du hast schon teilgenommen ✓</h2><p>Auf diesem Gerät wurde „${esc(info.titel || 'die Umfrage')}“ schon abgeschickt.</p><p class="help">Benutzt jemand anderes dieses Gerät und hat noch nicht teilgenommen?</p><button class="btn alt" id="again">Jemand anderes möchte teilnehmen</button>`);
    $('#again').onclick = intro; return;
  }
  intro();

  function run() {
    let draft = {}; try { draft = JSON.parse(sessionStorage.getItem(DK) || '{}'); } catch (e) { }
    screen.hidden = true; screen.innerHTML = ''; $('#app').hidden = false;
    const doc = info.doc; docId = String(doc.id || '');
    startPathFinder({
      player: true, doc, storage: 'probe-u', appName: 'Probe', logo: 'app/icon.svg', answers: draft,
      host: {
        onAnswer: (id, v, all) => { try { sessionStorage.setItem(DK, JSON.stringify(all)); } catch (e) { } },
        submitNote: info.mode === 'name' ? `Verschlüsselt an ${info.lehrkraft} – mit deinem Namen.` : `Verschlüsselt und anonym an ${info.lehrkraft}.`,
        submit: async ({ answers }) => {
          const a = answersFromSvy(doc, answers);
          const payload = info.mode === 'name' ? { v: 1, answers: a, who: { v: me.v, n: me.n }, at: Date.now() } : { v: 1, answers: a }; // anonym: kein Name, keine Uhrzeit
          try {
            await api('u_submit', { ...(me && info.mode !== 'tafel' ? { tid: await tidOf(me.t) } : {}), answers_enc: await K.seal(info.pub_key, payload) });
          } catch (e) {
            if (e.status === 409 || e.status === 403) { cleanup(); card(`<h2>Das ging nicht</h2><p class="err">${esc(e.message)}</p>`); return; }
            alert(e.message); return;
          }
          cleanup();
          if (info.mode !== 'name') { try { await idbPut({ k: doneKey, t: 0 }); } catch (e) { } }
          card(`<h2>Danke! ✓</h2><p>Deine Antworten sind verschlüsselt bei ${esc(info.lehrkraft)} angekommen.</p>`
            + (info.mode === 'name' ? '<p class="help">Willst du noch etwas ändern? Scanne deinen QR-Code noch einmal und schicke den Bogen neu ab – der neue ersetzt den alten.</p>' : info.mode === 'einmal' ? '<p class="help">Dein Code ist jetzt verbraucht.</p>' : '')
            + '<p class="help">Du kannst diese Seite jetzt schließen.</p>');
          me = null;
        },
      }
    });
  }
}
boot();
