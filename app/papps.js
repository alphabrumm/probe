// Probe-Apps im Modul Unterricht (Lehrkraft): welche Apps es gibt, Freigaben, „Lernpfad + App“ bauen (links die App, rechts
// der Lernpfad-Editor), eigene App per KI ergänzen (mit Probe-Check), Live-Ansicht einer App-Einheit.
// Protokoll und Sandbox: vendor/pathfinder/core/pfpapp.js
import { readManifest, checkApp, mountApp, appPromptRules, appBuildPrompt, appFitsFach, appFitsJg } from '../vendor/pathfinder/core/pfpapp.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const plain = s => String(s || '').replace(/<[^>]*>/g, '').trim();
const lc = s => String(s || '').trim().toLowerCase();

/** eingebaute Apps; html-Apps bringen ihren Steckbrief in der Datei mit */
export const BUILTIN = [
  { id: 'jpad', kind: 'jpad', name: 'JPad', icon: '☕', fach: 'Informatik', label: 'Als Java-Projekt realisieren', hint: 'Lernpfad und Code nebeneinander in JPad, mit Programmier-Aufgaben', beschreibung: 'Java programmieren am iPad (Online-IDE)', ready: true },
  { id: 'qpad', kind: 'pfapp', name: 'QPad', icon: '🗄', fach: 'Informatik', label: 'Als SQL-Projekt realisieren', beschreibung: 'Datenbanken und SQL', ready: false },
  { id: 'flowpad', kind: 'pfapp', name: 'FlowPad', icon: '🔀', fach: 'Informatik', label: 'Als Flussdiagramm-Projekt realisieren', beschreibung: 'Algorithmen als Flussdiagramm', ready: false },
  { id: 'tabelle', kind: 'pfapp', name: 'Tabellen', icon: '📊', fach: 'Informatik', label: 'Als Tabellen-Projekt realisieren', beschreibung: 'Tabellenkalkulation', ready: false },
  { id: 'zellaufbau', kind: 'html', file: 'apps/zellaufbau.html', ready: true },
];

let CACHE = null;
/** alle Apps, die es für diese Lehrkraft gibt (eingebaute + eigene), mit Steckbrief, HTML und Freigabe */
export async function loadApps(H, force = false) {
  if (CACHE && !force && CACHE.uid === H.S.user?.id) return CACHE; // nach Ab- und Anmelden ohne Neuladen nicht die Liste der vorigen Lehrkraft zeigen
  const [R, L] = await Promise.all([H.api('papp_rules'), H.api('lp_list')]);
  const out = [];
  for (const b of BUILTIN) {
    let a = { ...b, builtin: true };
    if (b.file) {
      try { const html = await (await fetch(b.file, { cache: 'no-cache' })).text(), { m } = readManifest(html); if (m) a = { ...a, name: m.name, icon: m.icon, beschreibung: m.beschreibung, fach: m.fach, jg: m.jg, m, html }; else continue; }
      catch (e) { continue; }
    }
    out.push(a);
  }
  for (const x of (L.items || []).filter(x => x.form === 'app')) {
    try { const { item } = await H.api('lp_get', { id: x.id }), d = await H.K.open(H.S.priv, item.doc_enc), { m } = readManifest(d.html); if (m) out.push({ id: 'own' + x.id, lpid: x.id, kind: 'html', own: true, name: m.name, icon: m.icon, beschreibung: m.beschreibung, fach: m.fach, jg: m.jg, m, html: d.html, ready: true }); }
    catch (e) { }
  }
  for (const a of out) a.rule = R.rules?.[a.id] || null;
  CACHE = { apps: out, faecher: R.faecher || [], meine: R.meine || [], me: R.me, uid: H.S.user?.id };
  return CACHE;
}
export function dropCache() { CACHE = null; }
/** darf die Lehrkraft die App für dieses Fach nutzen? (Freigabe durch den Admin, sonst Fach im Steckbrief; eigene immer) */
export function allowed(C, a, fach) {
  if (a.own) return true;
  const r = a.rule;
  if (r) return !!(r.alle || (r.lehrkraefte || []).includes(C.me) || (fach ? (r.faecher || []).map(lc).includes(lc(fach)) : (r.faecher || []).some(f => !C.meine.length || C.meine.map(lc).includes(lc(f)))));
  if (fach) return appFitsFach(a, fach);
  return !String(a.fach || '').trim() || !C.meine.length || C.meine.some(f => appFitsFach(a, f));
}
/** Fächer, für die die App gilt (für den KI-Dialog: „fach“ als Liste) */
const fachList = a => a.rule ? (a.rule.alle ? '' : (a.rule.faecher || []).join(', ')) : (a.fach || '');
/** Liste für den KI-Dialog (Schritt 2, „Umsetzung als App“) */
export async function kiApps(H) {
  const C = await loadApps(H);
  return C.apps.filter(a => a.own || !a.rule || a.rule.alle || (a.rule.lehrkraefte || []).includes(C.me) || (a.rule.faecher || []).length)
    .map(a => ({ id: a.id, name: a.name, icon: a.icon, fach: a.own ? (a.fach || '') : fachList(a), jg: a.jg || '', ready: a.ready !== false, label: a.label || `Als ${a.name}-Projekt realisieren`,
      hint: a.hint || a.beschreibung || '', rules: a.m ? appPromptRules(a.m) : '' }));
}

/* ---------- Material „Lernpfad + App“ ---------- */
/** Steckbrief ohne eingebauten Lernpfad (der steckt im Material) */
const slim = m => { const { lernpfad, lernpfadText, ...rest } = m || {}; return rest; };
export function material(a, lernpfad) {
  return { form: 'papp', title: plain(lernpfad?.title) || a.name, app: { id: a.id, m: slim(a.m), html: a.html }, lernpfad: lernpfad || null, meta: lernpfad?.meta || (a.fach ? { fach: String(a.fach).split(',')[0].trim() } : {}) };
}
/** eingebauter Lernpfad der App (Steckbrief: lernpfad oder lernpfadText) als PathFinder-Dokument */
export async function builtinLernpfad(a) {
  if (a.m?.lernpfad) return JSON.parse(JSON.stringify(a.m.lernpfad));
  if (!a.m?.lernpfadText) return null;
  const T = await import('../vendor/pathfinder/core/pftext.js'), { pappPlugin } = await import('../vendor/pathfinder/core/pfpapp.js');
  const uid = () => Math.random().toString(36).slice(2, 10);
  const emptyDoc = (form = 'lernpfad') => ({ v: 2, id: uid(), form, design: { pal: 0, font: 'pixel', shape: 'eckig', hero: 'logo', heroImg: '' }, kicker: '', title: '', subtitle: '', goals: [], rank: '', anim: {}, typeLines: [],
    stations: [{ id: uid(), title: '', sub: '', check: false, blocks: [{ id: uid(), type: 'text', html: '' }] }], cert: { on: true, need: 'immer', pct: 80, text: 'hat den Lernpfad mit folgendem Ergebnis bearbeitet:', show: { zeit: true, tipps: true, quiz: true, xp: true } } });
  const r = T.parseText(a.m.lernpfadText, { plugins: [pappPlugin], palettes: [{ n: 'Standard' }], figures: {}, uid, emptyDoc, isCheck: () => false, appName: 'Probe', attachments: {}, files: {} });
  return r.errors?.length ? null : r.doc;
}

/* ---------- Bauen: links die App (zum Ausprobieren), rechts der Lernpfad-Editor mit „App-Aufgaben“ ---------- */
/** save(id, mat) → id; onDone() nach dem Schließen */
export function authorPapp(H, { id = null, mat, ki = false, save, onDone }) {
  const { esc, toast } = H;
  const w = document.createElement('div'); w.className = 'papp-author';
  w.innerHTML = `<div class="pa-bar"><b>${esc(mat.app.m?.icon || '🧩')} ${esc(mat.app.m?.name || 'App')}</b><span class="help">links ausprobieren · rechts der Lernpfad: mit „KI“ oben im Editor erweitern, App-Aufgaben über ＋ Baustein → App-Aufgabe; in der Vorschau lösen die Ereignisse der App sie</span><span class="sp"></span><span class="help" id="paSaved"></span></div>
    <div class="pa-split"><div class="pa-app" id="paApp"></div><div class="pa-lp"><iframe src="editor.html" title="Lernpfad bearbeiten"></iframe></div></div>`;
  document.body.appendChild(w); document.body.style.overflow = 'hidden';
  const fr = $('iframe', w); let timer = null, pending = null, saving = Promise.resolve();
  const flush = () => { clearTimeout(timer); if (!pending) return saving; mat.lernpfad = pending; mat.title = plain(pending.title) || mat.title; if (pending.meta) mat.meta = pending.meta; pending = null;
    const snap = JSON.parse(JSON.stringify(mat)); saving = saving.then(async () => { id = await save(id, snap); const s = $('#paSaved', w); if (s) s.textContent = '✓ gespeichert'; }).catch(er => toast('⚠ Speichern fehlgeschlagen: ' + esc(er.message), 5000)); return saving; };
  const app = mountApp($('#paApp', w), { html: mat.app.html, onEvent: n => { try { fr.contentWindow.pappEvent?.(n); } catch (e) { } }, onError: m => toast('⚠ App: ' + esc(m), 5000) });
  const close = async () => { await flush(); app.destroy(); w.remove(); document.body.style.overflow = ''; H.cleanLocal?.(); onDone?.(id); };
  const onMsg = ev => {
    if (ev.source !== fr.contentWindow || ev.data?.probeEditor !== 'ready') return; removeEventListener('message', onMsg);
    fr.contentWindow.probeEdit({ doc: mat.lernpfad || undefined, startDialog: ki ? 'ki' : !mat.lernpfad, forms: ['lernpfad', 'challenge'], papp: { events: mat.app.m?.events || [], name: mat.app.m?.name },
      ...(ki && typeof ki === 'object' ? { kiPreset: ki } : {}),
      kiApp: { id: mat.app.id, name: mat.app.m?.name, rules: mat.app.m ? appPromptRules(mat.app.m) : '' }, // jeder KI-Prompt im Editor kennt die App
      host: { saved: d => { pending = d; const s = $('#paSaved', w); if (s) s.textContent = '…'; clearTimeout(timer); timer = setTimeout(flush, 1500); }, done: d => { pending = d; close(); }, doneLabel: 'Fertig – zurück zu Probe', doneTitle: 'Speichern und zurück' } });
  };
  addEventListener('message', onMsg);
  if (!id) { pending = mat.lernpfad || null; if (pending) flush(); else saving = saving.then(async () => { id = await save(null, mat); }); } // neu: gleich anlegen
}

/* ---------- Live-Ansicht einer App-Einheit: App schreibgeschützt mit dem Stand der Person ---------- */
export function watchPapp(H, { title, html, get, onClose }) {
  const { esc } = H, w = document.createElement('div'); w.className = 'papp-author';
  w.innerHTML = `<div class="pa-bar"><b>${esc(title)}</b><span class="help" id="paSum"></span><span class="sp"></span><button class="btn sm" data-x>Schließen</button></div><div class="pa-app pa-full" id="paApp"></div>`;
  document.body.appendChild(w); document.body.style.overflow = 'hidden';
  const x0 = get(); let last = x0?.updated || 0;
  const app = mountApp($('#paApp', w), { html, state: x0?.app?.state ?? null, readonly: true });
  const line = () => { const x = get(); $('#paSum', w).textContent = x ? `${x.app?.summary?.text || ''}${x.sum ? ` · Lernpfad ${x.sum.pct} %` : ''} · zuletzt ${new Date(x.updated * 1000).toLocaleTimeString('de-DE')}` : 'noch nichts gemacht'; };
  line();
  const iv = setInterval(() => { const x = get(); if (x && x.updated !== last) { last = x.updated; app.load(x.app?.state ?? null, true); } line(); }, 1500);
  $('[data-x]', w).onclick = () => { clearInterval(iv); app.destroy(); w.remove(); document.body.style.overflow = ''; onClose?.(); };
}

/* ---------- Eigene Probe-App ergänzen: beschreiben → Prompt für eine andere KI → HTML einfügen → Probe-Check → speichern ---------- */
export function ownAppDialog(H, { faecher = [], save, onDone }) {
  const { dialog, esc, toast, pickFile } = H; let html = '', res = null;
  const d = dialog('＋ Eigene Probe-App', `<div class="pa-steps">
    <p class="help">Eine <b>Probe-App</b> ist eine kleine interaktive Lern-App (eine HTML-Seite), die im Unterricht <b>links neben einem Lernpfad oder einer Challenge</b> läuft – z. B. eine Zelle zum Beschriften in Biologie. Die App meldet, was die Schüler tun („Zellkern richtig beschriftet“), und <b>App-Aufgaben</b> im Lernpfad sind damit gelöst. Den Lernpfad dazu baust du danach wie gewohnt (auch mit KI).</p>
    <h3>1 · Beschreibe deine App</h3>
    <div class="row pa-row"><label class="f">Name<input type="text" id="an" maxlength="60" placeholder="z. B. Zellaufbau"><span class="h">so heißt die App im Unterricht</span></label>
      <label class="f">Fach<select id="af"><option value="">alle Fächer</option>${faecher.map(f => `<option>${esc(f)}</option>`).join('')}</select><span class="h">für welches Fach die App gedacht ist</span></label>
      <label class="f">Jahrgangsstufe<input type="text" id="aj" maxlength="10" placeholder="z. B. 5-7" inputmode="numeric"><span class="h">leer = alle</span></label></div>
    <label class="f">Was sollen die Schüler in der App tun?<textarea id="ab" rows="4" placeholder="z. B. Eine Tier- und eine Pflanzenzelle beschriften: Karten mit Zellkern, Zellmembran … an die richtige Stelle ziehen; ein Tipp auf einen Teil zeigt seine Aufgabe."></textarea></label>
    <label class="f"><span>Weitere Hinweise für die KI <span class="h">(optional)</span></span><textarea id="ai" rows="2" placeholder="z. B. Farben wie im Schulbuch, große Schrift, keine Punkte"></textarea></label>
    <h3>2 · Prompt kopieren und in einer KI einfügen</h3>
    <p class="help">Zum Beispiel in ByLKI, Claude oder ChatGPT. Die KI antwortet mit einer kompletten HTML-Datei.</p>
    <div class="btns" style="justify-content:flex-start"><button class="btn" id="acopy">📋 Prompt kopieren</button></div>
    <h3>3 · Antwort der KI einfügen und prüfen</h3>
    <textarea id="ah" rows="6" class="mono" placeholder="&lt;!doctype html&gt; … (die ganze Antwort der KI)" spellcheck="false"></textarea>
    <div class="btns" style="justify-content:flex-start"><button class="btn" id="afile">⤒ HTML-Datei wählen</button><button class="btn" id="acheck">🔎 Probe-Check</button></div>
    <div id="ares"></div>
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go" disabled>Speichern</button></div></div>`, { wide: true });
  const prompt = () => appBuildPrompt({ name: $('#an', d.el).value.trim(), fach: $('#af', d.el).value, jg: $('#aj', d.el).value.trim(), beschreibung: $('#ab', d.el).value.trim(), ideen: $('#ai', d.el).value.trim() });
  $('#acopy', d.el).onclick = async () => { const p = prompt(); try { await navigator.clipboard.writeText(p); toast('📋 Prompt kopiert – jetzt in der KI einfügen'); } catch (e) { $('#ah', d.el).value = p; toast('Kopieren ging nicht – der Prompt steht im Feld unten.'); } };
  $('#afile', d.el).onclick = () => pickFile('.html,.htm,text/html', async f => { $('#ah', d.el).value = await f.text(); run(); });
  const run = async () => {
    html = $('#ah', d.el).value.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
    $('#ares', d.el).innerHTML = '<p class="help">prüft …</p>'; $('#go', d.el).disabled = true;
    res = await checkApp(html);
    $('#ares', d.el).innerHTML = `${res.ok ? `<p class="good">✓ Probe-Check bestanden: „${esc(res.m?.name || '')}“ ${esc(res.m?.icon || '')} · ${res.m?.events.length || 0} Ereignisse${res.m?.fach ? ' · ' + esc(res.m.fach) : ''}</p>` : '<p class="bad">✗ Die App besteht den Probe-Check noch nicht. Gib der KI diese Liste und bitte sie, genau diese Punkte zu korrigieren:</p>'}
      ${res.errors.length ? `<ul class="bad">${res.errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${res.warnings.length ? `<ul class="warn">${res.warnings.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
    $('#go', d.el).disabled = !res.ok;
  };
  $('#acheck', d.el).onclick = run;
  $('#go', d.el).onclick = async () => {
    if (!res?.ok) return; $('#go', d.el).disabled = true;
    try { await save({ form: 'app', title: res.m.name, html, meta: res.m.fach ? { fach: res.m.fach.split(',')[0].trim() } : {} }); dropCache(); d.close(); toast(`✓ „${esc(res.m.name)}“ gespeichert – jetzt einen Lernpfad dazu bauen`); onDone?.(); }
    catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
  };
}
export { appFitsFach, appFitsJg };

/* ---------- Live-Ansicht für Lernpfad, Challenge und Lernpfad + App ---------- */
/** links die App (falls vorhanden), rechts der Lernpfad (lv.html, schreibgeschützt) mit dem Stand der Person; 📍 = mitgehen zur Station,
 *  in der die Person gerade ist; 💬 = Kommentar (onComment). get() liefert den neuesten Stand { app, sum, prog, updated }. */
export function watchLive(H, { title, live, app, lernpfad, get, comments, onComment, onClose }) {
  const { esc, dialog, toast } = H, w = document.createElement('div'); w.className = 'papp-author';
  w.innerHTML = `<div class="pa-bar"><b>${esc(title)}</b><span class="help" id="paSum"></span><span class="sp"></span>
      ${live && lernpfad ? '<label class="help" title="Immer zur Station springen, in der die Person gerade ist"><input type="checkbox" id="paFol" checked> 📍 mitgehen</label>' : ''}
      ${onComment ? '<button class="btn sm" data-cm>💬 Kommentar</button>' : ''}<button class="btn sm" data-x>Schließen</button></div>
    <div class="pa-split">${app ? '<div class="pa-app" id="paApp"></div>' : ''}${lernpfad ? `<div class="pa-lp"${app ? '' : ' style="flex:1"'}><iframe src="lv.html" title="Lernpfad (Live-Ansicht)"></iframe></div>` : ''}</div>`;
  document.body.appendChild(w); document.body.style.overflow = 'hidden';
  const x0 = get(), fr = $('iframe', w), fol = () => !!$('#paFol', w)?.checked; let last = x0?.updated || 0, ready = false;
  const A = app ? mountApp($('#paApp', w), { html: app.html || '', state: x0?.app?.state ?? null, readonly: true }) : null;
  const onMsg = ev => { if (!fr || ev.source !== fr.contentWindow || ev.data?.probeLv !== 'ready') return; removeEventListener('message', onMsg); ready = true;
    const x = get(); fr.contentWindow.lvStart({ doc: lernpfad, progress: x?.prog || {}, events: app?.m?.events || [], name: app?.m?.name, follow: fol() }); };
  addEventListener('message', onMsg);
  const stName = id => plain(lernpfad?.stations?.find(s => s.id === id)?.title) || '';
  const line = () => { const x = get(); $('#paSum', w).textContent = x ? [x.app?.summary?.text, x.sum ? `Lernpfad ${x.sum.pct} %` : '', x.prog?.here && stName(x.prog.here) ? `📍 ${stName(x.prog.here)}` : '', `zuletzt ${new Date(x.updated * 1000).toLocaleTimeString('de-DE')}`].filter(Boolean).join(' · ') : 'noch nichts gemacht'; };
  line();
  const iv = setInterval(() => { const x = get(); if (x && x.updated !== last) { last = x.updated; A?.load(x.app?.state ?? null, true); if (ready) try { fr.contentWindow.lvSet(x.prog || {}, fol()); } catch (e) { } } line(); }, 1500);
  w.onclick = async ev => {
    if (ev.target.closest('[data-x]')) { clearInterval(iv); removeEventListener('message', onMsg); A?.destroy(); w.remove(); document.body.style.overflow = ''; onClose?.(); return; }
    if (!ev.target.closest('[data-cm]')) return;
    const here = get()?.prog?.here, L = (await comments?.()) || [];
    const d = dialog('💬 Kommentar', `${L.length ? `<div class="pa-cms">${L.map(c => `<div>💬 ${esc(c.t)}${c.stt ? ` <span class="help">· ${esc(c.stt)}</span>` : ''} <span class="help">${new Date(c.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${c.seen ? ' · gelesen' : ''}</span></div>`).join('')}</div>` : ''}
      <label class="f">Neuer Kommentar<textarea id="cmT" rows="3" maxlength="600" placeholder="z. B. Schau dir bei Aufgabe 2 noch einmal den Tipp an."></textarea></label>
      ${here && stName(here) ? `<label class="pref"><input type="checkbox" id="cmSt" checked><span>zur Station „${esc(stName(here))}“ (die Person kann hinspringen)</span></label>` : ''}
      <p class="help">Auf dem iPad blinkt oben ein grüner Punkt; der Kommentar geht verschlüsselt (Klassenschlüssel) an die Person.</p>
      <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">Senden</button></div>`);
    $('#go', d.el).onclick = async () => {
      const t = $('#cmT', d.el).value.trim(); if (!t) return; $('#go', d.el).disabled = true;
      const st = $('#cmSt', d.el)?.checked ? here : null;
      try { await onComment({ t, st, stt: st ? stName(st) : '' }); d.close(); toast('💬 gesendet'); } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
    };
  };
}
