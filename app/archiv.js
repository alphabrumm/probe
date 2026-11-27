// Probe – Archivierung von Prüfungen.
// Lehrkraft: einzelne Prüfung oder alle beendeten Prüfungen des Schuljahres als Archiv exportieren – verschlüsselt für ihren eigenen
// Schlüssel und (falls eingerichtet) den Schul-Wiederherstellungsschlüssel. Eine Kopie geht verschlüsselt an den Server, damit der Admin
// sie ins Jahresarchiv übernehmen kann (lesen kann er sie nicht). Archive lassen sich über „Prüfung einlesen“ wieder öffnen.
// Grüner Punkt = archiviert und die Bewertung seither unverändert; roter Punkt = noch nicht (wieder) archiviert.
import { zipBlob, unzip } from './zip.js';

let X; // Hilfen aus probe.js: S, api, K, dialog, toast, withBusy, esc, fmtDate, pickFile …
const $ = (s, r = document) => r.querySelector(s);
const ARCH = ['beendet', 'veroeffentlicht'];
export const archivable = e => ARCH.includes(e.status);

/* ---------- Anzeige: Punkt und Brille ---------- */
export const dotHtml = e => archivable(e) ? `<span class="adot ${e.archived_ok ? 'ok' : 'no'}" title="${e.archived_ok ? 'archiviert' : e.archived ? 'seit dem Archivieren geändert – bitte neu archivieren' : 'noch nicht archiviert'}" role="img" aria-label="${e.archived_ok ? 'archiviert' : 'nicht archiviert'}"></span>` : '';
const BRILLE = '<svg viewBox="0 0 32 16" aria-hidden="true"><circle cx="8" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="24" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13.5 8.5q2.5-2 5 0M2.5 8 1 4M29.5 8 31 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const glassesHtml = s => {
  if (!s) return '';
  const [c, t] = s === 'abgezeichnet' ? ['ok', 'respiziert'] : s === 'rueckfrage' ? ['rf', 'Rückfrage der Fachleitung'] : ['lauf', 'wird gerade von der Fachleitung respiziert'];
  return `<span class="brille ${c}" title="${t}" role="img" aria-label="${t}">${BRILLE}</span>`;
};
export const legendHtml = () => `<p class="help legende"><span class="adot ok"></span> archiviert · <span class="adot no"></span> noch nicht archiviert (oder seither geändert) ·
  <span class="brille lauf">${BRILLE}</span> in Respizienz · <span class="brille rf">${BRILLE}</span> Rückfrage · <span class="brille ok">${BRILLE}</span> respiziert</p>`;

const safe = s => String(s ?? '').replace(/[^\wäöüÄÖÜß.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
export const fileBase = (m, kuerzel) => [m.klasse, m.fach, m.art, m.datum, kuerzel].map(safe).join('_');
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 120000); };
/** fn aufrufen, sobald der Dialog weg ist (egal ob über ✕, daneben tippen oder d.close()) */
function onGone(d, fn) { const mo = new MutationObserver(() => { if (!d.el.isConnected) { mo.disconnect(); fn(); } }); mo.observe(document.body, { childList: true }); }
async function schoolKey() { try { return (await X.api('school_key')).key; } catch (e) { return null; } }

/* ---------- Inhalt einer Prüfung (entschlüsselt, nur im Browser) ---------- */
async function record(id) {
  const { K, S, api } = X, open = async s => s ? K.open(S.priv, s) : null;
  const [{ exam: e }, r] = await Promise.all([api('exam_get', { id }), api('exam_results', { id })]);
  const g = await open(r.grading_enc), participants = [], comments = [];
  for (const p of r.participants) {
    let identity = { v: '?', n: '(unlesbar)' }, answers = null;
    try { identity = await open(p.identity_enc); } catch (er) { }
    try { answers = await open(p.answers_enc); } catch (er) { }
    participants.push({ id: p.id, identity, answers, status: p.status, saved: +p.saved || 0, fokus: +p.fokus || 0, zuschlag: +p.zuschlag || 0, imported: +p.imported || 0 });
  }
  for (const c of r.comments) { try { comments.push({ rid: c.rid, created: +c.created, data: await open(c.comment_enc) }); } catch (er) { } }
  const meta = { schuljahr: e.schuljahr, klasse: e.klasse, fach: e.fach, art: e.art, datum: e.datum, titel: e.titel, dauer: e.dauer, erwartet: e.erwartet, skala: e.skala,
    aufgaben: e.aufgaben, punkte: e.punkte, opened: e.opened, ended: e.ended, status: e.status };
  return { e, g, rec: { kind: 'probe-pruefung', v: 1, meta, lehrkraft: { kuerzel: S.user.kuerzel, name: S.user.name || '' }, doc: await open(e.draft_enc), key: await open(r.key_enc),
    roster: (await open(e.roster_enc)) || [], grading: g, participants, comments } };
}
/** eine Prüfung verschlüsseln und die Kopie an den Server; gibt Datei und neue Rahmendaten zurück */
async function archiveOne(id, school) {
  const { K, S, api } = X, { e, g, rec } = await record(id);
  const A = await K.archiveSeal({ probe: 'pruefungen', v: 1, exams: [rec] }, {
    users: [{ role: 'lehrkraft', kuerzel: S.user.kuerzel, name: S.user.name || '', pub_key: S.keys.pub_key }], school,
    info: { typ: 'pruefung', klasse: e.klasse, fach: e.fach, art: e.art, datum: e.datum, schuljahr: e.schuljahr, von: S.user.kuerzel },
  });
  const json = JSON.stringify(A), r = await api('exam_archive_put', { id, archive: json, ghash: await K.gradingHash(g) });
  return { name: fileBase(e, S.user.kuerzel) + '.probe-archiv.json', data: json, exam: r.exam };
}

/** Archivieren (eine oder mehrere Prüfungen): Hinweis, verschlüsseln, Kopie an den Server, Datei herunterladen. Gibt die neuen Rahmendaten zurück. */
export async function archiveExams(H, exams, { label = '' } = {}) {
  X = H; const { esc } = X, L = exams.filter(archivable);
  if (!L.length) { X.toast('⚠ Archivieren geht erst, wenn eine Prüfung beendet ist.'); return null; }
  const school = await schoolKey();
  return new Promise(resolve => {
    const d = X.dialog('📦 Prüfung archivieren', `<p>${L.length === 1 ? `Die Prüfung <b>${esc(L[0].klasse)} · ${esc(L[0].fach)} · ${esc(L[0].art)}</b> vom ${esc(X.fmtDate(L[0].datum))}` : `<b>${L.length} Prüfungen</b>${label ? ' ' + esc(label) : ''}`}
        wird als Archiv-Datei heruntergeladen – mit Aufgaben, Lösungen, Namen, Antworten, Fotos, Korrekturen und Noten. So lässt sie sich später über „Prüfung einlesen“ wieder in Probe öffnen.</p>
      <p class="warnbox">🔐 Das Archiv wird <b>verschlüsselt</b>. Lesbar ist es nur mit <b>deinem Schlüssel</b>, also mit deinem Probe-Passwort bzw. deinem Wiederherstellungscode${school ? ` – im Notfall außerdem mit der Schul-Passphrase aus dem Tresor der Schulleitung` : ''}. Ohne sie kann niemand die Datei öffnen, auch du nicht.</p>
      <p class="help">${L.length > 1 ? 'Du bekommst eine ZIP-Datei mit einer Archiv-Datei je Prüfung. ' : ''}Bewahre sie im Speicher der Schule auf (z. B. ByCS-Drive). Eine verschlüsselte Kopie geht an Probe – daraus erstellt der Admin am Schuljahresende das Jahresarchiv (lesen kann er sie nicht).</p>
      <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">📦 Archiv erstellen</button></div>`);
    let done = null; onGone(d, () => resolve(done));
    $('#go', d.el).onclick = async () => {
      $('#go', d.el).disabled = true;
      try {
        const files = await X.withBusy(`Archiv wird erstellt … 0 / ${L.length}`, async () => {
          const out = [];
          for (const e of L) { out.push(await archiveOne(e.id, school)); const b = $('.busy span'); if (b) b.textContent = `Archiv wird erstellt … ${out.length} / ${L.length}`; }
          return out;
        });
        if (files.length === 1) download(new Blob([files[0].data], { type: 'application/json' }), files[0].name);
        else download(zipBlob(files.map(f => ({ name: f.name, data: f.data }))), `Pruefungsarchiv_${safe(X.S.user.kuerzel)}_${safe(L[0].schuljahr || '')}_${new Date().toISOString().slice(0, 10)}.zip`);
        done = files.map(f => f.exam); d.close(); X.toast(`✓ ${files.length === 1 ? 'Prüfung' : files.length + ' Prüfungen'} archiviert`, 4000);
      } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
    };
  });
}

/* ---------- Einlesen ---------- */
async function fromRaw(R) {
  const { K, S } = X;
  if (R.pub !== S.keys.pub_key) throw new Error(`„${R.info?.klasse} ${R.info?.fach} ${R.info?.datum}“ gehört zu ${R.info?.von || 'einer anderen Lehrkraft'} und lässt sich nur mit deren Schlüssel öffnen.`);
  const open = async s => { try { return s ? await K.open(S.priv, s) : null; } catch (e) { return null; } };
  const rec = { kind: 'probe-pruefung', v: 1, meta: R.meta, lehrkraft: { kuerzel: R.info?.von || '' }, doc: await open(R.draft_enc), key: await open(R.key_enc), roster: (await open(R.roster_enc)) || [],
    grading: await open(R.grading_enc), participants: [], comments: [] };
  for (const p of R.participants || []) rec.participants.push({ id: p.id, identity: (await open(p.identity_enc)) || { v: '?', n: '(unlesbar)' }, answers: await open(p.answers_enc), saved: +p.saved || 0, fokus: +p.fokus || 0, zuschlag: +p.zuschlag || 0, imported: +p.imported || 0 });
  for (const c of R.comments || []) { const data = await open(c.comment_enc); if (data) rec.comments.push({ rid: c.rid, created: +c.created, data }); }
  if (!rec.doc || !rec.key) throw new Error('Diese Datei ließ sich nicht entschlüsseln.');
  return rec;
}
/** Bewertung auf die neuen Teilnehmer-Nummern umschreiben */
function remap(g, map) {
  if (!g) return g; g = JSON.parse(JSON.stringify(g));
  const re = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [map.has(k) ? String(map.get(k)) : k, v]));
  for (const k of ['manual', 'override', 'feedback', 'link', 'hk', 'ki']) if (g[k]) g[k] = re(g[k]);
  if (g.merge) g.merge = Object.fromEntries(Object.entries(g.merge).map(([k, v]) => [map.has(k) ? String(map.get(k)) : k, map.has(String(v)) ? map.get(String(v)) : v]));
  return g;
}
async function restore(rec, school) {
  const { K, S, api } = X, seal = d => K.seal(S.keys.pub_key, d), P = rec.participants || [];
  const r = await api('exam_restore', {
    meta: rec.meta, draft_enc: await seal(rec.doc), key_enc: await seal(rec.key), roster_enc: rec.roster?.length ? await seal(rec.roster) : null, roster_n: rec.roster?.length || 0,
    participants: await Promise.all(P.map(async p => ({ identity_enc: await seal(p.identity), answers_enc: p.answers ? await seal(p.answers) : null, saved: p.saved, fokus: p.fokus, zuschlag: p.zuschlag, imported: p.imported }))),
    comments: await Promise.all((rec.comments || []).map(async c => ({ rid: c.rid, created: c.created, comment_enc: await seal(c.data) }))),
  });
  const id = r.exam.id, g = remap(rec.grading, new Map(P.map((p, i) => [String(p.id), r.pids[i]])));
  if (g) await api('exam_grading', { id, grading_enc: await seal(g), ghash: await K.gradingHash(g) });
  await archiveOne(id, school); // stammt aus einem Archiv: gleich wieder als archiviert vermerken (mit Kopie für das Jahresarchiv)
  return r.exam;
}
/** „Prüfung einlesen“: Archiv-Datei(en) (.json oder .zip) öffnen, Prüfungen auswählen und als neue, beendete Prüfungen anlegen */
export function importExams(H, onDone) {
  X = H; const { esc } = X;
  X.pickFile('.json,.zip,application/json,application/zip', async f => {
    let texts = [];
    try {
      if (/\.zip$/i.test(f.name) || f.type === 'application/zip') { for (const z of await unzip(await f.arrayBuffer())) if (/\.json$/i.test(z.name)) texts.push({ name: z.name, text: await z.text() }); }
      else texts = [{ name: f.name, text: await f.text() }];
    } catch (er) { X.toast('⚠ ' + esc(er.message), 5000); return; }
    const files = []; for (const t of texts) { try { files.push({ name: t.name, A: JSON.parse(t.text) }); } catch (er) { } }
    if (!files.some(x => ['archiv', 'roh'].includes(x.A?.probe))) { X.toast('⚠ Darin ist kein Probe-Archiv.', 5000); return; }
    let pass = '';
    const openAll = async () => {
      const recs = [], errs = [];
      for (const { name, A } of files) {
        try {
          if (A.probe === 'roh') { recs.push(await fromRaw(A)); continue; }
          if (A.probe !== 'archiv') continue;
          let data = await X.K.archiveOpen(A, { priv: X.S.priv, pub: X.S.keys.pub_key });
          if (!data && pass) data = await X.K.archiveOpen(A, { passphrase: pass });
          if (!data) { errs.push({ name, locked: true }); continue; }
          if (data.probe !== 'pruefungen') { errs.push({ name, msg: 'kein Prüfungsarchiv (z. B. ein Respizienz-Archiv – das öffnest du unter „Respizienz“)' }); continue; }
          recs.push(...data.exams);
        } catch (er) { errs.push({ name, msg: er.message }); }
      }
      return { recs, errs };
    };
    let res = await X.withBusy('Archiv wird geöffnet …', openAll);
    if (!res.recs.length && res.errs.some(x => x.locked)) {
      const pp = await askPass(); if (!pp) return; pass = pp;
      res = await X.withBusy('Archiv wird geöffnet …', openAll);
      if (!res.recs.length) { X.toast('⚠ Die Passphrase passt nicht.', 5000); return; }
    }
    chooseAndRestore(res, onDone);
  });
}
function askPass() {
  return new Promise(resolve => {
    const d = X.dialog('Archiv-Passphrase', `<p>Dieses Archiv ist nicht für deinen Schlüssel verschlüsselt. Mit der <b>Schul-Passphrase</b> aus dem Tresor der Schulleitung lässt es sich öffnen.</p>
      <label class="f">Passphrase<input type="password" id="pp" autocomplete="off"></label><div class="btns"><button class="btn pri" id="go">Öffnen</button></div>`);
    let v = null; onGone(d, () => resolve(v));
    $('#go', d.el).onclick = () => { v = $('#pp', d.el).value; d.close(); };
  });
}
function chooseAndRestore({ recs, errs }, onDone) {
  const { esc, fmtDate } = X;
  if (!recs.length) { X.dialog('Archiv lässt sich nicht öffnen', `<ul>${errs.map(x => `<li>${esc(x.name)}: ${esc(x.msg || 'nicht für deinen Schlüssel verschlüsselt')}</li>`).join('')}</ul>`); return; }
  const d = X.dialog('📂 Prüfung einlesen', `<p>Im Archiv ${recs.length === 1 ? 'ist eine Prüfung' : `sind ${recs.length} Prüfungen`}. Ausgewählte Prüfungen werden als <b>neue, beendete Prüfungen</b> angelegt – mit Abgaben, Korrekturen und Noten (ohne Ergebnisseiten für die Schüler).</p>
    <div class="scroll-x"><table class="t"><tr><th></th><th>Datum</th><th>Klasse</th><th>Fach · Art</th><th>Teilnehmer</th><th>Lehrkraft</th></tr>
    ${recs.map((r, i) => `<tr><td><input type="checkbox" data-i="${i}" checked aria-label="einlesen"></td><td>${esc(fmtDate(r.meta.datum))}</td><td><b>${esc(r.meta.klasse)}</b></td><td>${esc(r.meta.fach)} · ${esc(r.meta.art)}<div class="help">${esc(r.meta.titel || '')}</div></td><td>${(r.participants || []).length}</td><td>${esc(r.lehrkraft?.name || r.lehrkraft?.kuerzel || '')}</td></tr>`).join('')}</table></div>
    ${errs.length ? `<p class="help">Nicht lesbar: ${errs.map(x => esc(x.name)).join(', ')}</p>` : ''}
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">Einlesen</button></div>`, { wide: true });
  $('#go', d.el).onclick = async () => {
    const sel = [...d.el.querySelectorAll('[data-i]:checked')].map(x => recs[+x.dataset.i]); if (!sel.length) return;
    $('#go', d.el).disabled = true;
    try {
      const school = await schoolKey(), made = [];
      await X.withBusy(`Prüfungen werden eingelesen … 0 / ${sel.length}`, async () => { for (const r of sel) { made.push(await restore(r, school)); const b = $('.busy span'); if (b) b.textContent = `Prüfungen werden eingelesen … ${made.length} / ${sel.length}`; } });
      d.close(); X.toast(`✓ ${made.length === 1 ? 'Prüfung' : made.length + ' Prüfungen'} eingelesen`, 4000); onDone?.(made);
    } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
  };
}

/* ---------- Admin: Jahresarchiv aller Lehrkräfte (ZIP, Ordner je Fachschaft) ---------- */
export async function yearArchive(H, sj) {
  X = H; const { esc } = X;
  let L; try { L = (await X.api('adm_exams', { schuljahr: sj })).items; } catch (er) { X.toast('⚠ ' + esc(er.message)); return; }
  if (!L.length) { X.toast(`Im Schuljahr ${sj} gibt es keine beendeten Prüfungen.`); return; }
  const ok = L.filter(x => x.archiviert && x.snap).length;
  const d = X.dialog(`📦 Jahresarchiv ${esc(sj)}`, `<p><b>${L.length} beendete Prüfungen</b> aller Lehrkräfte, als ZIP-Datei mit einem Ordner je Fachschaft. Der Dateiname nennt Klasse, Fach, Art, Datum und den Nutzernamen der Lehrkraft.</p>
    <p class="warnbox">🔐 Alle Prüfungen bleiben verschlüsselt – du siehst nur die Dateinamen.
      <b>${ok}</b> davon hat die Lehrkraft archiviert: Sie lassen sich mit ihrem Schlüssel öffnen und im Notfall mit der Schul-Passphrase aus dem Tresor.
      ${L.length - ok ? `<b>${L.length - ok}</b> sind noch nicht (oder nicht mit dem aktuellen Stand) archiviert – sie heißen „…_NICHT-ARCHIVIERT“ und lassen sich <b>nur von der Lehrkraft selbst</b> öffnen.` : ''}</p>
    <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">⇩ Jahresarchiv herunterladen</button></div>`);
  $('#go', d.el).onclick = async () => {
    $('#go', d.el).disabled = true;
    try {
      const files = await X.withBusy(`Jahresarchiv … 0 / ${L.length}`, async () => {
        const out = [], used = new Set();
        for (const x of L) {
          const r = await X.api('adm_exam_blob', { id: x.id }), dir = String(x.fachschaft || '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'ohne Fachschaft';
          let name = `${dir}/${fileBase(x, x.kuerzel)}${r.archive ? '' : '_NICHT-ARCHIVIERT'}`; for (let k = 2; used.has(name); k++) name = name.replace(/(_\d+)?$/, '_' + k);
          used.add(name); out.push({ name: name + (r.archive ? '.probe-archiv.json' : '.probe-roh.json'), data: r.archive || JSON.stringify(r.raw) });
          const b = $('.busy span'); if (b) b.textContent = `Jahresarchiv … ${out.length} / ${L.length}`;
        }
        return out;
      });
      download(zipBlob(files), `Probe-Jahresarchiv_${safe(sj)}_${new Date().toISOString().slice(0, 10)}.zip`);
      X.api('adm_archive_log', { schuljahr: sj, n: files.length }).catch(() => { });
      d.close(); X.toast(`✓ Jahresarchiv mit ${files.length} Prüfungen erstellt`, 4000);
    } catch (er) { $('#err', d.el).textContent = er.message; $('#go', d.el).disabled = false; }
  };
}

/* ---------- Fachleitung: Statistik „Prüfungen der Fachschaft“ ---------- */
export async function statsHtml(H, sj) {
  X = H; const { esc, fmtDate } = X;
  const r = await X.api('fl_stats', sj ? { schuljahr: sj } : {}), L = r.items;
  const by = new Map(); for (const x of L) { const k = `${x.fachschaft}\u0000${x.lehrkraft}`; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  const fs = [...new Set(L.map(x => x.fachschaft))];
  return `<section class="card"><h2>Prüfungen der Fachschaft${fs.length ? ' ' + esc(fs.join(', ')) : ''} · Schuljahr ${esc(r.schuljahr)}</h2>
    <p class="help">Alle in diesem Schuljahr geschriebenen, ausgewerteten und für die Schüler freigegebenen Prüfungen – nur Klasse, Art und Datum, ohne Inhalte und Ergebnisse.
      Inhalte und Ergebnisse siehst du nur bei Prüfungen, die zur Respizienz eingereicht wurden.</p>
    <p class="help legende"><span class="adot ok"></span> von der Lehrkraft archiviert · <span class="adot no"></span> noch nicht archiviert (oder seit dem Archivieren geändert)</p>
    ${L.length ? [...by.entries()].map(([k, xs]) => `<h3 style="margin:14px 0 6px">${esc(k.split('\u0000')[1])} <span class="help">· ${xs.length} Prüfung${xs.length === 1 ? '' : 'en'}${fs.length > 1 ? ' · ' + esc(xs[0].fachschaft) : ''} · ${xs.filter(x => x.archiviert).length} archiviert</span></h3>
      <div class="scroll-x"><table class="t"><tr><th style="width:2em"></th><th>Datum</th><th>Klasse</th><th>Fach</th><th>Art</th></tr>${xs.map(x => `<tr><td>${dotHtml({ status: 'veroeffentlicht', archived_ok: x.archiviert })}</td><td>${esc(fmtDate(x.datum))}</td><td><b>${esc(x.klasse)}</b></td><td>${esc(x.fach)}</td><td>${esc(x.art)}</td></tr>`).join('')}</table></div>`).join('')
    : '<p class="help">Noch keine freigegebene Prüfung in diesem Schuljahr.</p>'}</section>`;
}
