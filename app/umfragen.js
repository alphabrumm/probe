// Probe – Umfragen: Fragebogen in PathFinder gestalten (Art „Befragung“, Stil Lumi), Teilnahme per QR-Code, Auswertung.
//
// Drei Arten der Teilnahme:
//   tafel   anonym – ein QR-Code für alle (Tafel, Beamer, Moodle). Ergebnisse ab U_MIN Antworten.
//   einmal  anonym mit Einmal-Codes – jede:r bekommt einen Code, der nur einmal gilt. Der Server merkt sich verbrauchte
//           Codes getrennt von den Antworten; Antworten tragen weder Code noch Zeit. Ergebnisse erst nach dem Beenden
//           und ab U_MIN Antworten – sonst ließe sich durch Vergleichen zurückrechnen, wer was geantwortet hat.
//   name    mit Namen – persönliche QR-Codes, die Lehrkraft sieht, wer was geantwortet hat.
// Antworten, Teilnehmerliste und der Entwurf des Fragebogens sind mit dem Schlüssel der Lehrkraft verschlüsselt.
// Klartext auf dem Server: nur Titel, Gruppe, Zähler und der veröffentlichte Fragebogen (die Fragen, nicht die Antworten).
import { surveySpec, answersFromSvy, surveyStats } from '../vendor/pathfinder/core/pfsurvey.js';
import { Pdf, PAGE_W, PAGE_H, fit, wrap, showPdf } from './pdf.js';
import { qrMatrix, qrSvg } from './qr.js';
import { newToken } from './pqr.js';
import { tabsHtml } from './coaching.js';
import { VORLAGEN_U } from './uvorlagen.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const te = new TextEncoder();
const hex = u8 => [...new Uint8Array(u8)].map(x => x.toString(16).padStart(2, '0')).join('');
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const utidOf = async t => hex(await crypto.subtle.digest('SHA-256', te.encode('probe-umfrage|' + t)));
const base = () => new URL('u.html', location.href).href.replace(/[?#].*$/, '');
const boardLink = code => `${base()}?u=${code}`;
const personalLink = (code, r) => `${base()}?u=${code}#p=${b64u(te.encode(JSON.stringify(r.v || r.n ? { v: r.v, n: r.n, t: r.t } : { t: r.t })))}`;
const fullName = r => `${r.v || ''} ${r.n || ''}`.trim();
const nkey = r => `${r.n}|${r.v}`.toLowerCase();
const fmtNum = x => x == null ? '–' : (Math.round(x * 10) / 10).toLocaleString('de-DE');
const pct = (a, n) => n ? Math.round(100 * a / n) : 0;
const shuffle = A => { for (let i = A.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [A[i], A[j]] = [A[j], A[i]]; } return A; };

export const MODES = {
  tafel: { ic: '🔓', label: 'Anonym – ein QR-Code für alle', short: 'anonym', help: 'Ein QR-Code an der Tafel, am Beamer oder in Moodle. Niemand braucht ein eigenes Blatt. Du siehst nicht, wer geantwortet hat; Ergebnisse ab 5 Antworten.' },
  einmal: { ic: '🎟', label: 'Anonym mit Einmal-Codes', short: 'Einmal-Codes', help: 'Jede:r bekommt einen Code, der nur einmal gilt – so antwortet niemand doppelt. Die Antworten werden ohne Code gespeichert, du siehst also nicht, wer was geantwortet hat. Ergebnisse nach dem Beenden, ab 5 Antworten.' },
  name: { ic: '👤', label: 'Mit Namen', short: 'mit Namen', help: 'Persönliche QR-Codes. Du siehst, wer was geantwortet hat (wie beim Coaching-Fragebogen). Sage das den Teilnehmenden vorher.' },
};
const state = s => !s.published ? ['Fragebogen fehlt', 'warn'] : s.open ? ['läuft', 'good'] : s.ended ? ['beendet', ''] : s.n ? ['pausiert', 'warn'] : ['bereit', ''];

/* ---------- Daten einer Umfrage laden und entschlüsseln ---------- */
async function load(H, id) {
  const { S, api, K } = H, r = await api('u_get', { id }), s = r.survey;
  const doc = r.doc_enc ? await K.open(S.priv, r.doc_enc) : null;
  const R = r.roster_enc ? await K.open(S.priv, r.roster_enc) : [];
  for (const x of R) x.tid = await utidOf(x.t);
  const byK = new Map(R.map(x => ['p' + x.tid, x])), list = [];
  for (const a of r.answers) {
    let o; try { o = await K.open(S.priv, a.answers_enc); } catch (e) { continue; }
    const who = a.k ? byK.get(a.k) || (o.who ? { ...o.who, unknown: true } : null) : null;
    list.push({ answers: o.answers || {}, who, at: o.at || null });
    if (who && byK.has(a.k)) who.sub = list[list.length - 1];
  }
  return { s, doc, R, list, spec: doc ? surveySpec(doc) : null };
}

/* ---------- Übersicht ---------- */
export async function viewSurveyList(H) {
  const { S, api, main, esc } = H;
  main.innerHTML = tabsHtml('u', S) + '<p class="help">lädt …</p>';
  let L; try { L = (await api('u_list')).surveys; } catch (e) { main.innerHTML = tabsHtml('u', S) + `<p class="err">${esc(e.message)}</p>`; return; }
  if (S.user.is_demo && !L.length && !S.uDemo) { S.uDemo = true; try { await createDemo(H); L = (await api('u_list')).surveys; } catch (e) { H.toast('⚠ ' + esc(e.message)); } }
  const bySj = {}; for (const s of L) (bySj[s.schuljahr] = bySj[s.schuljahr] || []).push(s);
  main.innerHTML = `${tabsHtml('u', S)}<h1>Umfragen</h1><p class="sub">Fragebogen in PathFinder gestalten, per QR-Code ausfüllen lassen, Ergebnisse auswerten – die Antworten kannst nur du lesen.</p>
    <div class="bar"><button class="btn pri" id="neu">＋ Neue Umfrage</button></div>
    ${L.length ? Object.keys(bySj).sort().reverse().map(sj => `<div class="klasse"><h2>${esc(sj)}</h2></div><div class="tiles">${bySj[sj].map(s => { const [st, cl] = state(s); return `<a class="tile" href="#/u/${s.id}">
      <span class="k">${esc(s.gruppe || 'ohne Gruppe')}</span><span class="t">${esc(s.titel || 'Umfrage ohne Titel')}</span><span class="m">${MODES[s.mode].ic} ${esc(MODES[s.mode].short)}</span>
      <span class="s"><span class="chip ${cl}">${st}</span><span class="chip ${s.n ? 'good' : ''}">📨 ${s.n}${s.mode !== 'tafel' && s.roster_n ? '/' + s.roster_n : ''} Antworten</span></span></a>`; }).join('')}</div>`).join('')
      : `<div class="empty"><img src="app/icon.svg" alt=""><h2>Noch keine Umfrage</h2><p>Feedback zum Unterricht, Klassenklima, Stimmungsbarometer oder ein eigener Fragebogen: anlegen, QR-Code zeigen oder austeilen, auswerten.</p></div>`}`;
  $('#neu').onclick = () => surveyForm(H, null);
}

/* ---------- Anlegen und Bearbeiten (Gruppe, Art, Teilnehmende) ---------- */
function surveyForm(H, D) {
  const { S, api, K, dialog, esc, field, toast, withBusy, parseNames } = H, s = D?.s, locked = !!s?.n;
  const named = (D?.R || []).filter(r => r.v || r.n), anonN = (D?.R || []).filter(r => !r.v && !r.n).length;
  const d = dialog(s ? 'Umfrage bearbeiten' : 'Neue Umfrage', `
    ${field('Klasse oder Gruppe', `<input type="text" id="gr" value="${esc(s?.gruppe || '')}" placeholder="z. B. 7c, Q12 Physik, Elternbeirat">`)}
    <div class="f"><b>Wer nimmt teil, wie anonym?</b>${locked ? '<span class="help">Es gibt schon Antworten – die Art lässt sich nicht mehr ändern.</span>' : ''}
    <div class="u-modes">${Object.entries(MODES).map(([k, m]) => `<label class="u-mode"><input type="radio" name="md" value="${k}"${(s?.mode || 'tafel') === k ? ' checked' : ''}${locked ? ' disabled' : ''}><span><b>${m.ic} ${esc(m.label)}</b><span class="help">${esc(m.help)}</span></span></label>`).join('')}</div></div>
    <div id="who">
      ${field('Teilnehmende', `<textarea id="nl" rows="6" placeholder="Nachname, Vorname – je Zeile, oder CSV einfügen">${esc(named.map(r => `${r.n}, ${r.v}`).join('\n'))}</textarea>`, 'Wird verschlüsselt gespeichert. Für jede:n entsteht ein QR-Code; bei gleichen Namen bleiben gedruckte Codes gültig.')}
      <div class="btns" style="margin:-4px 0 10px"><button class="btn sm" id="csvf">⤒ Klassenliste einlesen</button><span class="help">CSV oder Text aus der Schulverwaltung (z. B. ASV) oder aus Moodle</span></div>
      <div id="anz">${field('… oder nur eine Anzahl Codes (ohne Namen)', `<input type="number" id="nn" min="0" max="500" value="${anonN || ''}" placeholder="z. B. 28">`, 'Codes ohne Namen: Zettel mischen und austeilen. Mit Namen weißt du nur, dass jede:r genau einen Code hat – nicht, wer was antwortet.')}</div>
    </div>
    <div class="err" id="err"></div><button class="btn pri" id="go">${s ? 'Speichern' : 'Anlegen und Fragebogen gestalten'}</button>`, { wide: true });
  const mode = () => $('input[name=md]:checked', d.el).value;
  const upd = () => { $('#who', d.el).hidden = mode() === 'tafel'; $('#anz', d.el).hidden = mode() !== 'einmal'; };
  d.el.addEventListener('change', e => { if (e.target.name === 'md') upd(); }); upd();
  $('#csvf', d.el).onclick = () => H.pickFile('.csv,.txt,text/csv,text/plain', async f => { const L = parseNames(await f.text()); if (!L.length) { $('#err', d.el).textContent = 'In der Datei wurden keine Namen erkannt.'; return; } $('#nl', d.el).value = L.map(r => `${r.n}, ${r.v}`).join('\n'); $('#err', d.el).textContent = ''; toast(`✓ ${L.length} Namen eingelesen`); });
  $('#go', d.el).onclick = async () => {
    const m = mode(), gruppe = $('#gr', d.el).value.trim(), err = t => { $('#err', d.el).textContent = t; };
    let R = null;
    if (m !== 'tafel') {
      const L = parseNames($('#nl', d.el).value), N = Math.max(0, Math.min(500, +$('#nn', d.el).value || 0));
      if (L.length) { const old = new Map((D?.R || []).filter(r => r.v || r.n).map(r => [nkey(r), r.t])); R = L.map(r => ({ v: r.v, n: r.n, t: old.get(nkey(r)) || newToken() })); }
      else if (m === 'einmal' && N) { const old = (D?.R || []).filter(r => !r.v && !r.n); R = Array.from({ length: N }, (_, i) => ({ i: i + 1, t: old[i]?.t || newToken() })); }
      else return err(m === 'name' ? 'Bitte die Teilnehmenden eintragen.' : 'Bitte Teilnehmende eintragen oder eine Anzahl Codes angeben.');
      // wer schon geantwortet hat (mit Namen), bleibt in der Liste
      const keep = (D?.R || []).filter(r => r.sub && !R.some(x => x.t === r.t)); R.push(...keep.map(r => ({ v: r.v, n: r.n, t: r.t })));
    }
    try {
      const data = { id: s?.id, gruppe, mode: m };
      if (R) Object.assign(data, { roster_enc: await K.seal(S.keys.pub_key, R), roster_n: R.length, tids: await Promise.all(R.map(x => utidOf(x.t))) });
      else if (s && m === 'tafel' && s.mode !== 'tafel') Object.assign(data, { roster_enc: await K.seal(S.keys.pub_key, []), roster_n: 0, tids: [] });
      const r = await withBusy('verschlüsselt …', () => api('u_save', data));
      d.close();
      if (!s) { toast('✓ Umfrage angelegt – jetzt den Fragebogen gestalten'); location.hash = '#/u/' + r.survey.id; setTimeout(() => surveyEditor(H, { s: r.survey, doc: null, list: [] }), 300); }
      else { toast('✓ gespeichert'); viewSurvey(H, s.id); }
    } catch (e) { err(e.message); }
  };
}

/* ---------- Fragebogen in PathFinder (eingebettet) ---------- */
function surveyEditor(H, D, ro = false) {
  const { S, api, K, toast, withBusy, esc } = H, s = D.s;
  const wrapEl = document.createElement('div'); wrapEl.className = 'editor';
  const q = new URLSearchParams({ form: 'befragung', kopf: [s.gruppe, 'Umfrage'].filter(Boolean).join(' · ') });
  wrapEl.innerHTML = `<iframe src="editor.html?${esc(q.toString())}" title="${ro ? 'Fragebogen ansehen' : 'Fragebogen gestalten'}"></iframe>`;
  document.body.appendChild(wrapEl); document.body.style.overflow = 'hidden';
  const fr = $('iframe', wrapEl);
  let timer = null, pending = null, saving = Promise.resolve();
  const plainT = d => String(d.title || '').replace(/<[^>]*>/g, '').trim().slice(0, 160);
  const save = async (d, pub) => api('u_doc', { id: s.id, doc_enc: await K.seal(S.keys.pub_key, d), titel: plainT(d), ...(pub ? { pub_doc: JSON.stringify(d) } : {}) });
  const flush = () => { clearTimeout(timer); timer = null; if (!pending) return saving; const d = pending; pending = null; saving = saving.then(() => save(d)).catch(er => toast('⚠ Speichern fehlgeschlagen: ' + esc(er.message), 5000)); return saving; };
  const close = () => { wrapEl.remove(); document.body.style.overflow = ''; H.cleanLocal?.(); viewSurvey(H, s.id); };
  const start = () => {
    if (ro) return fr.contentWindow.probeEdit({ doc: D.doc, readOnly: true, readOnlyLabel: 'Nur ansehen – es gibt schon Antworten', host: { done: close, doneLabel: 'Schließen', doneTitle: 'Zurück zur Umfrage' } });
    fr.contentWindow.probeEdit({
      doc: D.doc || undefined, startDialog: !D.doc, vorlagen: VORLAGEN_U, vorlagenText: 'Feedback zum Unterricht, Klassenklima oder Stimmungsbarometer übernehmen und anpassen.',
      host: {
        saved: d => { pending = d; clearTimeout(timer); timer = setTimeout(flush, 1500); },
        done: async d => {
          clearTimeout(timer); pending = null; await saving;
          const n = surveySpec(d).questions;
          try {
            if (!n) { await save(d); toast('Gespeichert – der Fragebogen hat aber noch keine Frage. Über ＋ Fragen einfügen.', 5000); close(); return; }
            await withBusy('Fragebogen wird gespeichert …', () => save(d, true)); toast(`✓ Fragebogen fertig (${n} Frage${n === 1 ? '' : 'n'})`); close();
          } catch (er) { toast('⚠ ' + esc(er.message), 6000); }
        },
        doneLabel: 'Fertig – zurück zu Probe', doneTitle: 'Fragebogen speichern und zurück zur Umfrage',
      }
    });
  };
  const onMsg = ev => { if (ev.source === fr.contentWindow && ev.data?.probeEditor === 'ready') { removeEventListener('message', onMsg); start(); } };
  addEventListener('message', onMsg);
  addEventListener('pagehide', flush, { once: true });
}

/* ---------- Eine Umfrage ---------- */
export async function viewSurvey(H, id) {
  const { S, api, main, esc, toast, withBusy } = H;
  main.innerHTML = tabsHtml('u', S) + '<p class="help">entschlüsselt …</p>';
  let D; try { D = await load(H, id); } catch (e) { main.innerHTML = tabsHtml('u', S) + `<p class="err">${esc(e.message)}</p>`; return; }
  const { s, spec, R } = D, M = MODES[s.mode], [st, cl] = state(s);
  const nq = spec?.questions || 0, need = s.min - s.n;
  const wait = s.visible ? '' : s.mode === 'einmal' && !s.ended
    ? `Ergebnisse gibt es nach dem <b>Beenden</b> und ab ${s.min} Antworten – so bleibt anonym, wer was geantwortet hat.${need > 0 ? ` Noch ${need} Antwort${need === 1 ? '' : 'en'} bis ${s.min}.` : ''}`
    : `Ergebnisse gibt es ab ${s.min} Antworten – bei weniger ließe sich erraten, wer was geantwortet hat. Noch ${need} Antwort${need === 1 ? '' : 'en'}.`;
  main.innerHTML = `${tabsHtml('u', S)}<p><a href="#/umfragen">‹ Alle Umfragen</a></p>
    <h1>${esc(s.titel || 'Umfrage ohne Titel')}</h1>
    <p class="sub">${esc(s.gruppe || 'ohne Gruppe')} · ${M.ic} ${esc(M.label)} · Schuljahr ${esc(s.schuljahr)} <span class="c-lock">🔒 Antworten nur für dich lesbar</span></p>
    <div class="u-steps">
      <div class="card"><h3>1 · Fragebogen</h3><p class="help">${D.doc ? `${nq} Frage${nq === 1 ? '' : 'n'}${s.published ? '' : ' · noch nicht fertiggestellt'}` : 'noch leer'}</p>
        ${s.n ? '<button class="btn" id="ed">👁 Fragebogen ansehen</button>' : `<button class="btn ${s.published ? '' : 'pri'}" id="ed">✎ Fragebogen ${D.doc ? 'bearbeiten' : 'gestalten'}</button>`}</div>
      <div class="card"><h3>2 · Teilnahme</h3><p class="help">${s.mode === 'tafel' ? 'ein QR-Code für alle' : `${R.length} ${s.mode === 'name' ? 'Teilnehmende' : R.some(r => r.v || r.n) ? 'Teilnehmende mit Einmal-Code' : 'Einmal-Codes ohne Namen'}`}</p>
        ${s.mode === 'tafel' ? '<button class="btn" id="qr">▦ QR-Code zeigen</button>' : '<button class="btn" id="qrp">▦ QR-Codes (PDF)</button> <button class="btn" id="links">🔗 Links</button>'} <button class="btn ghost" id="set">Bearbeiten</button></div>
      <div class="card"><h3>3 · Umfrage <span class="chip ${cl}">${st}</span></h3><p class="help">📨 ${s.n}${s.mode !== 'tafel' && R.length ? ' von ' + R.length : ''} Antwort${s.n === 1 ? '' : 'en'}</p>
        ${s.open ? '<button class="btn" id="pause">⏸ Pausieren</button> <button class="btn" id="end">■ Beenden</button>'
          : s.ended && s.mode === 'einmal' ? '<span class="help">endgültig beendet</span>'
          : `<button class="btn pri" id="go"${s.published ? '' : ' disabled title="Erst den Fragebogen fertigstellen"'}>▶ ${s.n || s.ended ? 'Wieder öffnen' : 'Starten'}</button>${s.n && !s.ended ? ' <button class="btn" id="end">■ Beenden</button>' : ''}`}</div>
    </div>
    ${S.user.is_demo && s.open && s.mode === 'tafel' ? `<div class="c-hint"><b>Demo:</b> Tippe auf <b>▦ QR-Code zeigen</b> und scanne ihn mit einem zweiten Gerät – so sehen Schüler:innen die Umfrage. Nach dem Abschicken hier neu laden.</div>` : ''}
    <section class="card" id="res"><div class="bar"><h2 style="margin:0">Ergebnisse</h2><span class="sp"></span>${s.visible && D.list.length ? '<button class="btn" id="pr">🖨 Drucken</button>' : ''}</div>
      ${!spec ? '<p class="help">Noch kein Fragebogen.</p>' : !s.visible ? `<p class="help">${wait}</p>` : !D.list.length ? '<p class="help">Noch keine Antworten.</p>' : resultsHtml(D, esc)}</section>
    ${s.mode === 'name' && R.length ? `<section class="card"><h2 style="margin-top:0">Teilnehmende <span class="help">${R.filter(r => r.sub).length}/${R.length} geantwortet</span></h2>
      <table class="c-table">${R.map((r, i) => `<tr class="${r.sub ? 'click' : ''}" data-p="${i}"><td><b>${esc(fullName(r))}</b></td><td>${r.sub ? `<span class="chip good">✓${r.sub.at ? ' ' + new Date(r.sub.at).toLocaleDateString('de-DE') : ''}</span>` : '<span class="help">–</span>'}</td><td>${r.sub ? '<span class="help">Antworten ansehen ›</span>' : ''}</td></tr>`).join('')}</table></section>` : ''}
    <div class="bar" style="margin-top:18px"><span class="sp"></span><button class="btn ghost danger" id="del">🗑 Umfrage löschen</button></div>`;
  const on = (sel, fn) => { const b = $(sel, main); if (b) b.onclick = fn; };
  on('#ed', () => surveyEditor(H, D, !!s.n));
  on('#set', () => surveyForm(H, D));
  on('#qr', () => beamer(H, D));
  on('#qrp', () => { try { showPdf(slipsPdf(D, S.user.name || S.user.kuerzel), `QR-Codes_Umfrage_${s.gruppe || s.id}.pdf`.replace(/[^\wäöüÄÖÜß.-]+/g, '_')); } catch (er) { toast('⚠ ' + esc(er.message), 5000); } });
  on('#links', () => {
    const d = H.dialog('🔗 Persönliche Links', `<p class="help">Statt Zetteln: jeden Link einzeln verschicken, z. B. als persönliche Nachricht im Messenger oder in Moodle. ${s.mode === 'einmal' ? 'Jeder Link gilt nur einmal.' : 'Jeder Link gehört genau einer Person.'}</p>
      <table class="c-table">${R.map(r => `<tr><td style="white-space:nowrap"><b>${esc(r.v || r.n ? fullName(r) : 'Code ' + (r.i || ''))}</b></td><td><input type="text" readonly value="${esc(personalLink(s.code, r))}" onclick="this.select()" style="width:100%"></td></tr>`).join('')}</table>`, { wide: true });
  });
  const setOpen = async open => { try { await api('u_open', { id: s.id, open: open ? 1 : 0 }); toast(open ? '▶ Die Umfrage läuft' : '⏸ pausiert'); await viewSurvey(H, s.id); if (open && s.mode === 'tafel') beamer(H, { ...D, s: { ...s, open: true } }); } catch (e) { toast('⚠ ' + esc(e.message), 5000); } };
  on('#go', () => setOpen(true));
  on('#pause', () => setOpen(false));
  on('#end', async () => {
    if (!confirm(s.mode === 'einmal' ? 'Umfrage beenden? Danach nimmt sie keine Antworten mehr an und lässt sich nicht wieder öffnen. Erst dann siehst du die Ergebnisse (ab 5 Antworten).' : 'Umfrage beenden? Danach nimmt sie keine Antworten mehr an (du kannst sie wieder öffnen).')) return;
    try { await api('u_end', { id: s.id }); toast('■ beendet'); viewSurvey(H, s.id); } catch (e) { toast('⚠ ' + esc(e.message)); }
  });
  on('#pr', () => printResults(D, esc));
  on('#del', async () => { if (!confirm(`Umfrage „${s.titel || 'ohne Titel'}“ mit ${s.n} Antwort${s.n === 1 ? '' : 'en'} endgültig löschen?`)) return; await api('u_delete', { id: s.id }); toast('🗑 gelöscht'); location.hash = '#/umfragen'; });
  main.onclick = e => { const tr = e.target.closest('tr.click[data-p]'); if (tr) personDialog(H, D, R[+tr.dataset.p]); };
}

/* ---------- Ergebnisse ---------- */
function resultsHtml(D, esc, print = false) {
  const { s, spec, list } = D, St = surveyStats(spec, list.map(x => x.answers));
  let h = `<p class="help">${St.n} Antwort${St.n === 1 ? '' : 'en'}${s.mode !== 'name' ? ' · anonym' : ''}${print ? '' : ' · Freitexte in zufälliger Reihenfolge'}</p>`, sec = null;
  for (const q of St.qs) {
    if (q.sec && q.sec !== sec) { sec = q.sec; h += `<h3 class="u-sec">${esc(sec)}</h3>`; }
    h += `<div class="u-q"><div class="u-qh"><b>${esc(q.q)}</b><span class="help">${q.n} Antwort${q.n === 1 ? '' : 'en'}</span></div>`;
    if (q.t === 'scale') {
      const max = Math.max(1, ...Object.values(q.counts));
      h += `<div class="u-mean">Ø <b>${fmtNum(q.mean)}</b> <span class="help">auf der Skala ${q.min}${q.lo ? ` (${esc(q.lo)})` : ''} bis ${q.max}${q.hi ? ` (${esc(q.hi)})` : ''}</span></div>
        <div class="u-hist">${Object.entries(q.counts).map(([v, c]) => `<div title="${v}: ${c}"><span class="c">${c || ''}</span><span class="b" style="height:${Math.round(70 * c / max)}px"></span><span class="v">${v}</span></div>`).join('')}</div>`;
    } else if (q.counts) {
      h += `<div class="u-bars">${q.opts.map((o, i) => `<div class="r"><span>${esc(o)}</span><span class="track"><span class="b" style="width:${pct(q.counts[i], q.n)}%"></span></span><span class="n">${q.counts[i]} <span class="help">(${pct(q.counts[i], q.n)} %)</span></span></div>`).join('')}</div>${q.t === 'multi' ? '<span class="help">mehrere Antworten möglich</span>' : ''}`;
    } else if (q.rows) {
      const numeric = q.cols.every(c => /^[+−-]?\d+([.,]\d+)?$/.test(c.trim()));
      h += `<div class="scroll-x"><table class="u-mx"><tr><th></th>${q.cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>${numeric ? 'Ø' : ''}</th></tr>${q.rows.map(r => `<tr><td>${esc(r.item)}</td>${r.counts.map(c => `<td style="--p:${r.n ? c / r.n : 0}">${c || ''}</td>`).join('')}<td class="m">${numeric ? fmtNum(r.mean) : ''}</td></tr>`).join('')}</table></div>`;
    } else if (q.texts) {
      const T = s.mode === 'name' ? q.texts : shuffle([...q.texts]);
      h += T.length ? `<ul class="u-texts">${T.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="help">keine Antworten</p>';
    }
    h += '</div>';
  }
  return h;
}
function fmtAnswer(q, v, esc) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '<span class="help">–</span>';
  if (q.t === 'multi') return v.map(esc).join(', ');
  if (q.t === 'matrix') return `<ul class="u-plain">${q.items.map((it, i) => v[i] == null ? '' : `<li>${esc(it)}: <b>${esc(q.cols[q.vals.indexOf(v[i])] ?? v[i])}</b></li>`).join('')}</ul>`;
  if (q.t === 'date') return esc(new Date(v + 'T12:00').toLocaleDateString('de-DE'));
  return esc(String(v)).replace(/\n/g, '<br>');
}
function personDialog(H, D, r) {
  if (!r?.sub) return;
  const { dialog, esc } = H, a = r.sub.answers;
  const qs = D.spec.sections.flatMap(sec => sec.qs.filter(q => q.t !== 'info'));
  dialog(`${esc(fullName(r))}`, `<table class="c-table">${qs.map(q => `<tr><td style="width:45%"><b>${esc(q.q)}</b></td><td>${fmtAnswer(q, a[q.id], esc)}</td></tr>`).join('')}</table>`, { wide: true });
}
function printResults(D, esc) {
  let pr = $('#uprint'); if (!pr) { pr = document.createElement('div'); pr.id = 'uprint'; document.body.append(pr); }
  const { s } = D;
  pr.innerHTML = `<h1>${esc(s.titel || 'Umfrage')}</h1><p>${esc(s.gruppe || '')} · ${esc(MODES[s.mode].label)} · Stand ${new Date().toLocaleDateString('de-DE')}</p>${resultsHtml(D, esc, true)}`;
  document.body.classList.add('u-printing');
  const end = () => { document.body.classList.remove('u-printing'); pr.innerHTML = ''; removeEventListener('afterprint', end); };
  addEventListener('afterprint', end);
  setTimeout(() => { window.print(); setTimeout(() => { if (!matchMedia('print').matches) end(); }, 1500); }, 50);
}

/* ---------- QR-Code für Tafel und Beamer ---------- */
function beamer(H, D) {
  const { api, esc } = H, s = D.s, link = boardLink(s.code);
  const el = document.createElement('div'); el.className = 'u-beamer';
  el.innerHTML = `<div class="u-bcard"><div class="u-bhead"><b>${esc(s.titel || 'Umfrage')}</b><span>${esc(s.gruppe || '')}</span></div>
    <div class="u-bqr">${qrSvg(link, { title: 'QR-Code zur Umfrage' })}</div>
    <div class="u-blink">${esc(link.replace(/^https?:\/\//, ''))}</div>
    <div class="u-bfoot"><span>📨 <b id="bn">${s.n}</b> Antworten</span><span>${s.open ? '🔓 anonym · Antworten verschlüsselt' : '⏸ Die Umfrage ist noch nicht gestartet'}</span></div>
    <button class="btn" id="bx">Schließen</button></div>`;
  document.body.append(el);
  import('../vendor/pathfinder/core/pathfinder.js').then(m => { el.style.background = `#221e44 url(${m.LUMI_STARS}) repeat`; el.style.backgroundSize = '288px'; el.style.imageRendering = 'pixelated'; $('.u-bhead', el).insertAdjacentHTML('afterbegin', `<img class="u-owl" src="${m.LUMI_OWL}" alt="">`); }).catch(() => { });
  const tm = setInterval(async () => { try { const L = (await api('u_list')).surveys, x = L.find(y => y.id === s.id); if (x) $('#bn', el).textContent = x.n; } catch (e) { } }, 5000);
  const close = () => { clearInterval(tm); el.remove(); removeEventListener('keydown', esc1); viewSurvey(H, s.id); };
  const esc1 = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', esc1);
  $('#bx', el).onclick = close;
  try { el.requestFullscreen?.().catch(() => { }); } catch (e) { }
}

/* ---------- QR-Zettel (8 je A4-Seite) für Einmal-Codes und persönliche Codes ---------- */
function slipsPdf(D, coach) {
  const { s, R } = D; if (!R.length) throw new Error('Keine Teilnehmenden eingetragen');
  const pdf = new Pdf(`QR-Codes Umfrage ${s.gruppe}`), M = 28, W = (PAGE_W - 2 * M) / 2, Hh = (PAGE_H - 2 * M) / 4, Q = 118, pad = 14;
  const L = s.mode === 'name'
    ? ['Scanne den QR-Code mit deinem iPad.', 'Deine Lehrkraft sieht deinen Namen bei deinen Antworten.', 'Der Code gehört nur dir – gib ihn nicht weiter.']
    : ['Scanne den QR-Code mit deinem iPad.', 'Der Code gilt nur einmal. Deine Antworten werden', 'ohne Code und ohne Namen gespeichert – anonym.'];
  R.forEach((r, i) => {
    const k = i % 8; if (i && !k) pdf.addPage();
    const x = M + (k % 2) * W, y = M + Math.floor(k / 2) * Hh;
    pdf.line(x, y, x + W, y, '#c8c8c8', .5); pdf.line(x, y, x, y + Hh, '#c8c8c8', .5); pdf.line(x + W, y, x + W, y + Hh, '#c8c8c8', .5); pdf.line(x, y + Hh, x + W, y + Hh, '#c8c8c8', .5);
    const tw = W - Q - 3 * pad; let yy = y + pad + 14;
    pdf.text(fit(r.v || r.n ? fullName(r) : `Code ${r.i || i + 1}`, 14, true, tw), x + pad, yy, 14, { bold: true }); yy += 18;
    for (const t of wrap(`${s.titel || 'Umfrage'}${s.gruppe ? ' · ' + s.gruppe : ''}`, 9.5, false, tw).slice(0, 3)) { pdf.text(t, x + pad, yy, 9.5, { col: '#333333' }); yy += 12; }
    yy += 8;
    for (const t of L) for (const w of wrap(t, 8, false, tw)) { pdf.text(w, x + pad, yy, 8, { col: '#444444' }); yy += 10.5; }
    pdf.text(fit(`bei ${coach}`, 7, false, tw), x + pad, y + Hh - pad, 7, { col: '#a0a4ad' });
    const QM = qrMatrix(personalLink(s.code, r)), cs = Q / QM.length, qx = x + W - pad - Q, qy = y + (Hh - Q) / 2;
    pdf.color('#000000');
    QM.forEach((row, ry) => { let s0 = -1; for (let cx = 0; cx <= row.length; cx++) { const on = cx < row.length && row[cx]; if (on && s0 < 0) s0 = cx; if (!on && s0 >= 0) { pdf.ops.push(`${(qx + s0 * cs).toFixed(2)} ${(PAGE_H - qy - (ry + 1) * cs).toFixed(2)} ${((cx - s0) * cs).toFixed(2)} ${cs.toFixed(2)} re f`); s0 = -1; } } });
  });
  return pdf.bytes();
}

/* ---------- Demo: Feedback-Umfrage der Klasse 7z mit 14 erfundenen Antworten ---------- */
const DEMO_DOC = () => ({
  id: 'demo-feedback', form: 'befragung', title: 'Feedback zum Unterricht', subtitle: 'Deine ehrliche Meinung hilft, den Unterricht zu verbessern. Die Umfrage ist anonym.', kicker: '7z · Umfrage',
  pointsOn: false, cert: { on: false }, design: { theme: 'lumi', font: 'schlicht', shape: 'eckig' },
  stations: [
    { id: 'ds1', title: 'Wie läuft der Unterricht für dich?', sub: '', blocks: [
      { id: 'dq1', type: 'scale', q: 'Wie gut kommst du im Moment im Unterricht mit?', min: 1, max: 10, lo: 'gar nicht', hi: 'sehr gut' },
      { id: 'dq2', type: 'matrix', q: 'Wie sehr stimmst du zu?', items: ['Die Erklärungen verstehe ich.', 'Das Tempo passt für mich.', 'Ich traue mich, Fragen zu stellen.', 'Die Aufgaben sind abwechslungsreich.'], cols: ['trifft zu', 'trifft eher zu', 'trifft eher nicht zu', 'trifft nicht zu'] },
      { id: 'dq3', type: 'choice', q: 'Die Hausaufgaben sind für mich …', opts: ['zu wenig', 'genau richtig', 'zu viel'] } ] },
    { id: 'ds2', title: 'Deine Ideen', sub: '', blocks: [
      { id: 'dq4', type: 'open', q: 'Was soll so bleiben?', rows: 3, hint: 'freiwillig' },
      { id: 'dq5', type: 'open', q: 'Was sollte sich ändern?', rows: 3, hint: 'freiwillig' } ] },
  ],
});
async function createDemo(H) {
  const { S, api, K } = H, doc = DEMO_DOC();
  const r = await api('u_save', { gruppe: '7z', titel: doc.title, mode: 'tafel' }), id = r.survey.id;
  await api('u_doc', { id, doc_enc: await K.seal(S.keys.pub_key, doc), titel: doc.title, pub_doc: JSON.stringify(doc) });
  await api('u_open', { id, open: 1 });
  const bleib = ['Die Experimente', 'dass wir viel selbst ausprobieren', 'Die Gruppenarbeiten', 'die Erklärvideos', '', 'Die Wiederholung am Anfang der Stunde', ''];
  const aend = ['Weniger Hausaufgaben am Wochenende', 'mehr Zeit für Fragen', '', 'Langsamer bei neuen Formeln', 'Öfter Spiele zum Wiederholen', '', ''];
  for (let i = 0; i < 14; i++) {
    const svy = { dq1: [8, 7, 9, 6, 7, 5, 8, 9, 4, 7, 8, 6, 10, 7][i], dq2: { 0: [0, 1, 0, 1, 1, 2, 0, 0, 2, 1, 0, 1, 0, 1][i], 1: [1, 1, 0, 2, 1, 2, 1, 0, 3, 1, 1, 2, 0, 1][i], 2: [0, 2, 1, 1, 0, 3, 1, 0, 2, 1, 1, 0, 0, 2][i], 3: [0, 0, 1, 1, 0, 1, 0, 0, 1, 2, 0, 1, 0, 0][i] }, dq3: [1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 0, 1, 1, 2][i], dq4: bleib[i % bleib.length], dq5: aend[i % aend.length] };
    await api('u_submit', { code: r.survey.code, answers_enc: await K.seal(S.keys.pub_key, { v: 1, answers: answersFromSvy(doc, svy) }) });
  }
}
