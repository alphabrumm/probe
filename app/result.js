// Probe – Ergebnisseite für Schüler: e.html#ERGEBNISCODE
// Aus dem Code entstehen Bericht-ID und Schlüssel; der Server kennt weder Namen noch Noten. Kommentare gehen verschlüsselt an die Lehrkraft.
import * as K from './crypto.js';
import { codeAnswerHtml } from './hl.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const fmt = x => String(Math.round((+x || 0) * 100) / 100).replace('.', ',');
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

async function api(a, data) {
  let r, j;
  try { r = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, ...data }), cache: 'no-store' }); j = await r.json(); }
  catch (e) { throw new Error('Keine Verbindung zum Server.'); }
  if (!j.ok) throw new Error(j.error || 'Fehler');
  return j;
}

function ask(msg = '') {
  main.innerHTML = `<div class="center"><form class="card narrow stack" id="f"><img class="hero-ic" src="app/icon.svg" alt=""><h1 class="tc">Mein Ergebnis</h1>
    <p class="help tc">Gib den Ergebniscode ein, den du nach der Abgabe bekommen hast (dein Screenshot).</p>
    <label class="f">Ergebniscode<input type="text" id="c" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></label>
    <div class="err">${esc(msg)}</div><button class="btn pri">Ergebnis öffnen</button></form></div>`;
  $('#c').focus();
  $('#f').onsubmit = ev => { ev.preventDefault(); location.hash = K.normResult($('#c').value).match(/.{1,4}/g)?.join('-') || ''; };
}

async function show() {
  const code = decodeURIComponent(location.hash.slice(1));
  if (!K.normResult(code)) return ask();
  main.innerHTML = '<div class="center">Ergebnis wird geladen …</div>';
  let R, rid, key;
  try {
    ({ rid, key } = await K.reportKeys(code));
    const r = await api('r_get', { rid });
    R = await K.openSym(key, r.report_enc); R.expires = r.expires;
  } catch (e) { return ask(e.message); }
  const x = R.exam;
  main.innerHTML = `<div class="card stack">
    <div class="res-head"><div><div class="help">${esc(x.fach)} · ${esc(x.klasse)} · ${esc(x.art)} · ${esc(fmtDate(x.datum))}</div><h1>${esc(x.titel || 'Prüfung')}</h1><p><b>${esc(R.name)}</b></p></div>
      <div class="res-note"><b>${esc(R.note)}</b><span>${R.skala === 'punkte' ? 'Notenpunkte' : 'Note'}</span></div></div>
    <p><b>${fmt(R.punkte)} von ${fmt(R.max)} Punkten</b> (${Math.round(R.pct)} %)</p>
    <div class="btns no-print"><button class="btn" id="pr">🖨 Als PDF sichern</button><span class="help">Diese Seite ist nur bis ${new Date(R.expires * 1000).toLocaleDateString('de-DE')} abrufbar.</span></div>
    ${R.items.map((t, i) => `<section class="task"><h3><span>Aufgabe ${i + 1}: ${esc(t.title)}</span><span>${t.dropped ? 'nicht gewertet' : `${fmt(t.pts)} / ${fmt(t.max)} P.`}</span></h3>
      ${t.answer ? `<div class="ans">Deine Antwort: ${esc(t.answer)}</div>` : ''}${t.parts.map(p => `<div class="part ${p.ok ? 'ok' : 'no'}">${esc(p.label)}${/[?:.!]$/.test(p.label) ? '' : ':'} <b>${esc(p.given || '–')}</b>${p.ok ? '' : ` <span class="exp">richtig: ${esc(p.expected)}</span>`}</div>`).join('')}
      ${t.hand ? (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(t.img || '') ? `<a class="hand-ans" href="${t.img}" target="_blank" rel="noopener"><img src="${t.img}" alt="Deine handschriftliche Lösung"></a>` : '<div class="ans">– kein Foto abgegeben –</div>') : t.text != null ? (t.code && t.text ? codeAnswerHtml(t.text, t.app || 'jpad') : `<div class="ans">${esc(t.text || '– keine Antwort –')}</div>`) : ''}
      ${t.rubric?.length ? `<div class="help">Erwartet: ${t.rubric.map(r => `${esc(r.t)} (${fmt(r.p)} P.)`).join(' · ')}</div>` : ''}
      ${t.feedback ? `<div class="fb"><b>Rückmeldung:</b> ${esc(t.feedback)}</div>` : ''}
      <div class="cm no-print" data-i="${i}"><details><summary class="help">Frage oder Anmerkung zu dieser Aufgabe</summary><textarea placeholder="Was möchtest du deiner Lehrkraft zu dieser Aufgabe sagen?"></textarea><div class="btns" style="margin-top:6px"><button class="btn sm" data-send>Senden</button><span class="st"></span></div></details></div>
    </section>`).join('')}</div>`;
  $('#pr').onclick = () => print();
  main.onclick = async ev => {
    const b = ev.target.closest('[data-send]'); if (!b) return;
    const box = b.closest('.cm'), t = R.items[+box.dataset.i], text = $('textarea', box).value.trim(); if (!text) return;
    b.disabled = true;
    try { await api('r_comment', { rid, comment_enc: await K.seal(R.pub, { task: t.id, title: t.title, text, name: R.name, at: Date.now() }) }); $('.st', box).innerHTML = '<span class="sent">✓ gesendet</span>'; $('textarea', box).value = ''; }
    catch (e) { $('.st', box).textContent = e.message; }
    finally { b.disabled = false; }
  };
}
addEventListener('hashchange', show);
show();
