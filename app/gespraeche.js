// Probe – Gespräche: einzelne Gesprächsnotizen mit Schüler:innen, Eltern, Kolleg:innen oder frei – wann, wo, mit wem,
// Anlass und Thema, Ziele, Notizen, Vereinbarungen, Wiedervorlage. Keine Anhänge (Speicherplatz).
//
// Schutz wie bei den Coaching-Notizen: Alles wird im Browser mit dem Schlüssel der Lehrkraft verschlüsselt (ECDH P-256 +
// AES-256-GCM); der Server sieht nur Schuljahr und Zeitpunkte. Während des Schreibens liegt jeder Stand sofort verschlüsselt
// in IndexedDB (übersteht Stromausfall und WLAN-Ausfall) und wird gelöscht, sobald der Server ihn hat. Nie an eine KI.
// Probe löscht nie von selbst: Ab dem 15. Juli erinnert es bei jeder Anmeldung an Export oder Löschen.
import { idbPut, idbDel, idbAll } from './idb.js';
import { tabsHtml } from './coaching.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const deDate = d => d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00' : d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const sjEnd = sj => new Date(+String(sj).slice(0, 4) + 1, 6, 15);
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };
const lid = () => crypto.getRandomValues(new Uint32Array(2)).join('-');

export const ARTEN = { schueler: ['🧑‍🎓', 'Schüler:in'], eltern: ['👪', 'Eltern'], kollegium: ['👥', 'Kollegium'], sonst: ['💬', 'Sonstiges'] };
const ANLASS = ['Lernen / Leistung', 'Arbeitsverhalten', 'Sozialverhalten / Konflikt', 'Persönliche Situation', 'Laufbahn / Beratung', 'Zielvereinbarung / Folgegespräch', 'Organisation', 'Sonstiges'];
const INFORMIERT = ['Erziehungsberechtigte', 'Klassenleitung', 'Beratungslehrkraft', 'Schulpsychologie', 'Schulleitung', 'Jugendsozialarbeit'];
const ORTE = ['Klassenzimmer', 'Sprechzimmer', 'Lehrerzimmer', 'Telefon', 'Videokonferenz', 'Schulhof / Pause'];
const FELDER = [['ziele', 'Ziele des Gesprächs', 2], ['notizen', 'Gesprächsnotizen', 7], ['vereinbarungen', 'Vereinbarungen – wer macht was bis wann?', 4]];
const who = n => [n.mit, n.klasse && `(${n.klasse})`].filter(Boolean).join(' ') || 'ohne Namen';
const W = n => !!n.wieder && !n.erledigt;

/* ---------- Laden: alles entschlüsseln (die Liste ist klein, der Server kennt keine Inhalte) ---------- */
async function load(H) {
  const { S, api, K } = H, r = await api('t_list'), L = [];
  for (const t of r.talks) { try { L.push({ ...t, n: await K.open(S.priv, t.enc) }); } catch (e) { } }
  return L;
}
/** verschlüsselte Zwischenstände vom Gerät nachladen (Stromausfall, ohne WLAN geschrieben) */
async function syncPending(H) {
  const { S, api, K, toast } = H; let P = [];
  try { P = (await idbAll()).filter(e => e.k.startsWith(`tn|${S.user.id}|`)); } catch (e) { return; }
  if (!P.length) return;
  let srv = []; try { srv = await load(H); } catch (e) { return; }
  let n = 0;
  for (const p of P) {
    try {
      const s = p.id ? srv.find(x => x.id === p.id) : srv.find(x => x.n.lid === p.lid);
      if (!s || (s.n.updated || 0) < p.at) { await api('t_save', { id: s?.id || p.id || 0, enc: p.enc, datum: p.datum }); n++; }
      await idbDel(p.k);
    } catch (e) { }
  }
  if (n) toast(`🔒 ${n} Gesprächsnotiz${n === 1 ? '' : 'en'} vom Gerät nachgeladen`, 5000);
}

/* ---------- Übersicht ---------- */
let F = { art: '', q: '', sj: '' };
export async function viewTalks(H) {
  const { S, main, esc } = H;
  main.innerHTML = tabsHtml('g', S) + '<p class="help">entschlüsselt …</p>';
  await syncPending(H);
  let L; try { L = await load(H); } catch (e) { main.innerHTML = tabsHtml('g', S) + `<p class="err">${esc(e.message)}</p>`; return; }
  if (S.user.is_demo && !L.length && !S.tDemo) { S.tDemo = true; try { await demo(H); L = await load(H); } catch (e) { } }
  const sjs = [...new Set(L.map(t => t.schuljahr))].sort().reverse(); if (F.sj && !sjs.includes(F.sj)) F.sj = '';
  const old = L.filter(t => Date.now() >= sjEnd(t.schuljahr));
  const vis = () => { const q = F.q.trim().toLowerCase(); return L.filter(t => (!F.art || t.n.art === F.art) && (!F.sj || t.schuljahr === F.sj) && (!q || [t.n.mit, t.n.klasse, t.n.thema, t.n.anlass, t.n.ort, t.n.teilnehmer, ...FELDER.map(f => t.n[f[0]])].join(' ').toLowerCase().includes(q))); };
  const draw = () => {
    const R = vis().sort((a, b) => `${b.n.datum} ${b.n.zeit || ''}`.localeCompare(`${a.n.datum} ${a.n.zeit || ''}`));
    const due = L.filter(t => W(t.n)).sort((a, b) => a.n.wieder.localeCompare(b.n.wieder));
    $('#tl', main).innerHTML = `${due.length ? `<div class="card" style="margin-bottom:14px"><h2 style="margin-top:0">Wiedervorlagen</h2>${due.map(t => `<div class="t-row" data-t="${t.id}"><b class="${t.n.wieder <= today() ? 'err' : ''}">${esc(deDate(t.n.wieder))}</b><span>${ARTEN[t.n.art]?.[0] || ''} ${esc(who(t.n))}</span><span class="help">${esc(t.n.thema || t.n.anlass || '')}</span></div>`).join('')}</div>` : ''}
      <div class="card">${R.length ? R.map(t => `<div class="t-row" data-t="${t.id}"><b>${esc(deDate(t.n.datum))}${t.n.zeit ? ` <span class="help">${esc(t.n.zeit)}</span>` : ''}</b><span>${ARTEN[t.n.art]?.[0] || ''} ${esc(who(t.n))}</span><span class="help">${esc([t.n.anlass, t.n.thema].filter(Boolean).join(' · '))}</span>
        <span class="fl">${t.n.wieder && !t.n.erledigt ? `<span class="chip warn">⏰ ${esc(deDate(t.n.wieder))}</span>` : ''}${t.exported ? '<span class="chip">⇩ exportiert</span>' : ''}</span></div>`).join('') : `<p class="help">${L.length ? 'Keine Gespräche zu diesem Filter.' : 'Noch keine Gesprächsnotizen.'}</p>`}</div>`;
    $('#cnt', main).textContent = `${R.length} von ${L.length}`;
  };
  main.innerHTML = `${tabsHtml('g', S)}<h1>Gespräche</h1><p class="sub">Gesprächsnotizen mit Schüler:innen, Eltern und Kolleg:innen – wann, wo, Thema, Ziele, Vereinbarungen. <span class="c-lock">🔒 nur für dich lesbar</span></p>
    ${old.length ? `<div class="c-hint"><b>⏰ Schuljahr vorbei:</b> ${old.length} Gesprächsnotiz${old.length === 1 ? '' : 'en'} aus ${[...new Set(old.map(t => t.schuljahr))].join(', ')}. Bitte verschlüsselt exportieren oder löschen – Probe löscht nichts von selbst. <button class="btn sm" data-old>Jetzt erledigen</button></div>` : ''}
    <div class="bar"><button class="btn pri" id="neu">＋ Neues Gespräch</button><span class="sp"></span><button class="btn" id="pr">🖨 Drucken</button><button class="btn" id="ex">⇩ Export</button><button class="btn" id="op">📂 Datei öffnen</button></div>
    <div class="bar"><span class="seg">${[['', 'Alle'], ...Object.entries(ARTEN).map(([k, [i, t]]) => [k, `${i} ${t}`])].map(([k, t]) => `<button data-art="${k}" aria-pressed="${F.art === k}">${t}</button>`).join('')}</span>
      <input type="search" id="q" placeholder="Suchen: Name, Klasse, Thema, Text" value="${esc(F.q)}" style="max-width:280px">${sjs.length > 1 ? `<select id="sj" style="width:auto"><option value="">alle Schuljahre</option>${sjs.map(s => `<option${F.sj === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}<span class="help" id="cnt"></span></div>
    <div id="tl"></div>`;
  draw();
  $('#neu').onclick = () => editor(H, null);
  $('#q').oninput = e => { F.q = e.target.value; draw(); };
  $('#sj') && ($('#sj').onchange = e => { F.sj = e.target.value; draw(); });
  $('#pr').onclick = () => printTalks(H, vis().sort((a, b) => a.n.datum.localeCompare(b.n.datum)));
  $('#ex').onclick = () => exportDialog(H, vis());
  $('#op').onclick = () => openFile(H);
  $('[data-old]', main) && ($('[data-old]', main).onclick = () => yearEnd(H, old));
  main.onclick = e => {
    const a = e.target.closest('[data-art]'); if (a) { F.art = a.dataset.art; $$('[data-art]', main).forEach(b => b.setAttribute('aria-pressed', b === a)); draw(); return; }
    const r = e.target.closest('.t-row[data-t]'); if (r) editor(H, L.find(t => t.id === +r.dataset.t));
  };
}

/* ---------- Eine Gesprächsnotiz (speichert automatisch) ---------- */
function editor(H, t) {
  const { S, api, K, esc, toast } = H;
  const n = t ? { ...t.n } : { v: 1, lid: lid(), art: 'schueler', mit: '', klasse: '', teilnehmer: '', datum: today(), zeit: new Date().toTimeString().slice(0, 5), ort: '', anlass: '', thema: '', ziele: '', notizen: '', vereinbarungen: '', wieder: '', informiert: [], erledigt: false };
  let id = t?.id || 0;
  const el = document.createElement('div'); el.className = 'c-talk t-ed';
  const opt = (v, cur) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`;
  el.innerHTML = `<header><b>💬 Gespräch</b><span class="seg">${Object.entries(ARTEN).map(([k, [i, l]]) => `<button type="button" data-a="${k}" aria-pressed="${n.art === k}">${i} ${l}</button>`).join('')}</span><span class="sp"></span>
      <span class="c-save" id="tsv">🔒 wird verschlüsselt gespeichert</span><button class="btn sm" id="tpr" title="Drucken">🖨</button><button class="btn sm ghost danger" id="tdel" title="Löschen">🗑</button><button class="btn sm pri" id="tok">Fertig</button></header>
    <form class="t-form" id="tf" autocomplete="off">
      <div class="t-grid">
        <label class="f">Mit wem?<input type="text" name="mit" value="${esc(n.mit)}" placeholder="z. B. Max Muster, Frau Muster" maxlength="200"></label>
        <label class="f">Klasse<input type="text" name="klasse" value="${esc(n.klasse)}" placeholder="z. B. 7c" maxlength="20"></label>
        <label class="f">Weitere Teilnehmende<input type="text" name="teilnehmer" value="${esc(n.teilnehmer)}" placeholder="z. B. Beratungslehrkraft" maxlength="200"></label>
        <label class="f">Datum<input type="date" name="datum" value="${esc(n.datum)}"></label>
        <label class="f">Uhrzeit<input type="time" name="zeit" value="${esc(n.zeit)}"></label>
        <label class="f">Ort<input type="text" name="ort" value="${esc(n.ort)}" list="torte" maxlength="80"><datalist id="torte">${ORTE.map(o => `<option value="${esc(o)}">`).join('')}</datalist></label>
        <label class="f">Anlass<select name="anlass"><option value="">–</option>${ANLASS.map(a => opt(a, n.anlass)).join('')}</select></label>
        <label class="f t-wide">Thema<input type="text" name="thema" value="${esc(n.thema)}" maxlength="200"></label>
      </div>
      ${FELDER.map(([k, l, r]) => `<label class="f">${l}<textarea name="${k}" rows="${r}">${esc(n[k])}</textarea></label>`).join('')}
      <div class="t-grid">
        <label class="f">Wiedervorlage / nächster Termin<input type="date" name="wieder" value="${esc(n.wieder)}"></label>
        <label class="ck" style="align-self:end"><input type="checkbox" name="erledigt"${n.erledigt ? ' checked' : ''}> Vereinbarungen erledigt</label>
      </div>
      <div class="f"><b>Informiert</b><div class="fl">${INFORMIERT.map(x => `<label class="ck"><input type="checkbox" name="informiert" value="${esc(x)}"${n.informiert?.includes(x) ? ' checked' : ''}> ${esc(x)}</label>`).join('')}</div></div>
      <p class="help">Keine Anhänge. Nur notieren, was für die Arbeit nötig ist – persönliche Dinge so knapp wie möglich.</p>
    </form>`;
  document.body.append(el); document.body.style.overflow = 'hidden';
  const f = $('#tf', el);
  const collect = () => {
    for (const k of ['mit', 'klasse', 'teilnehmer', 'datum', 'zeit', 'ort', 'anlass', 'thema', 'wieder', ...FELDER.map(x => x[0])]) n[k] = (f.elements[k].value || '').slice(0, k in { notizen: 1, vereinbarungen: 1, ziele: 1 } ? 20000 : 200);
    n.datum = n.datum || today(); n.erledigt = f.elements.erledigt.checked; n.informiert = $$('[name=informiert]:checked', f).map(x => x.value); n.updated = Date.now();
  };
  const LK = () => `tn|${S.user.id}|${n.lid || id}`;
  let timer = null, ltimer = null, dirty = false, saving = Promise.resolve(), localQ = Promise.resolve(), localAt = 0;
  const local = () => { collect(); const snap = { ...n }; localAt = snap.updated;
    localQ = localQ.then(async () => { try { await idbPut({ k: LK(), uid: S.user.id, id, lid: n.lid, at: snap.updated, datum: snap.datum, enc: await K.seal(S.keys.pub_key, snap) }); } catch (e) { } }); };
  const save = () => {
    clearTimeout(timer); timer = null; if (!dirty) return saving; dirty = false; collect();
    $('#tsv', el).textContent = 'speichert …';
    return saving = saving.then(async () => {
      const sent = n.updated;
      try { const r = await api('t_save', { id, enc: await K.seal(S.keys.pub_key, { ...n }), datum: n.datum }); id = r.id;
        $('#tsv', el).textContent = `🔒 gespeichert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
        await localQ; if (localAt <= sent) { try { await idbDel(LK()); } catch (e) { } } }
      catch (e) { dirty = true; $('#tsv', el).innerHTML = `<span class="err">⚠ nicht beim Server: ${esc(e.message)} – verschlüsselt auf diesem Gerät gesichert</span>`; }
    });
  };
  const later = () => { dirty = true; $('#tsv', el).textContent = '…'; clearTimeout(timer); timer = setTimeout(save, 1200); clearTimeout(ltimer); ltimer = setTimeout(local, 250); };
  el.addEventListener('input', later); el.addEventListener('change', later);
  el.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (!a) return; n.art = a.dataset.a; $$('[data-a]', el).forEach(b => b.setAttribute('aria-pressed', b === a)); later(); });
  const close = () => { el.remove(); document.body.style.overflow = ''; viewTalks(H); };
  $('#tok', el).onclick = async () => {
    if (!id && !dirty) { close(); return; } // nichts geschrieben
    await save(); await localQ; if (dirty && !confirm('Die letzten Änderungen sind noch nicht beim Server, aber verschlüsselt auf diesem Gerät gesichert. Probe lädt sie nach, sobald wieder Verbindung besteht. Schließen?')) return;
    close();
  };
  $('#tpr', el).onclick = async () => { await save(); collect(); printTalks(H, [{ n }]); };
  $('#tdel', el).onclick = async () => {
    if (!confirm('Diese Gesprächsnotiz endgültig löschen?')) return;
    clearTimeout(timer); clearTimeout(ltimer); dirty = false; await saving; await localQ;
    try { if (id) await api('t_delete', { ids: [id] }); await idbDel(LK()).catch(() => { }); toast('🗑 gelöscht'); close(); } catch (e) { toast('⚠ ' + esc(e.message)); }
  };
  setTimeout(() => (t ? null : f.elements.mit.focus()), 50);
}

/* ---------- Drucken (für den Schul-Safe) ---------- */
function printTalks(H, list) {
  const { S, esc, toast } = H;
  if (!list.length) { toast('Nichts zum Drucken.'); return; }
  let pr = $('#cprint'); if (!pr) { pr = document.createElement('div'); pr.id = 'cprint'; document.body.append(pr); }
  const row = (l, v) => v ? `<div class="pq"><div class="pq-l">${l}</div><div class="pq-box">${esc(v).replace(/\n/g, '<br>')}</div></div>` : '';
  pr.innerHTML = list.map(({ n }) => `<div class="pp"><div class="pp-head"><b>GESPRÄCHSNOTIZ · ${esc((ARTEN[n.art]?.[1] || '').toUpperCase())}</b><span>${esc(S.user.name || S.user.kuerzel)}</span></div>
    <div class="pp-meta"><span>Mit: <u>${esc(who(n))}</u></span><span>Datum: <u>${esc(deDate(n.datum))} ${esc(n.zeit || '')}</u></span><span>Ort: <u>${esc(n.ort || '')}</u></span></div>
    <div class="pp-s">${row('Weitere Teilnehmende', n.teilnehmer)}${row('Anlass', n.anlass)}${row('Thema', n.thema)}${FELDER.map(([k, l]) => row(l, n[k])).join('')}
    ${row('Wiedervorlage', n.wieder ? deDate(n.wieder) + (n.erledigt ? ' (erledigt)' : '') : '')}${row('Informiert', (n.informiert || []).join(', '))}</div>
    <div class="pp-conf">Vertraulich behandeln.</div></div>`).join('');
  document.body.classList.add('c-printing');
  const end = () => { document.body.classList.remove('c-printing'); pr.innerHTML = ''; removeEventListener('afterprint', end); };
  addEventListener('afterprint', end);
  setTimeout(() => { window.print(); setTimeout(() => { if (!matchMedia('print').matches) end(); }, 1500); }, 50);
}

/* ---------- Export (verschlüsselt, Passphrase) und Datei öffnen ---------- */
function exportDialog(H, list) {
  const { S, api, K, dialog, esc, toast, withBusy } = H;
  if (!list.length) { toast('Nichts zu exportieren.'); return; }
  const d = dialog('⇩ Gesprächsnotizen verschlüsselt exportieren', `<p>${list.length} Gesprächsnotiz${list.length === 1 ? '' : 'en'} (der aktuelle Filter) – verschlüsselt (AES-256-GCM). Öffnen kann die Datei nur, wer die <b>Passphrase</b> kennt, oder du selbst mit deinem Probe-Konto (📂 Datei öffnen).</p>
    ${H.field('Passphrase (mindestens 12 Zeichen)', '<input type="password" id="pp1" autocomplete="new-password">')}${H.field('Passphrase wiederholen', '<input type="password" id="pp2" autocomplete="new-password">', 'Notiere sie getrennt von der Datei, z. B. im Schul-Safe.')}
    <div class="err" id="err"></div><button class="btn pri" id="go">Exportieren</button>`);
  $('#go', d.el).onclick = async () => {
    const p1 = $('#pp1', d.el).value, p2 = $('#pp2', d.el).value;
    if (p1.length < 12) { $('#err', d.el).textContent = 'Die Passphrase braucht mindestens 12 Zeichen.'; return; }
    if (p1 !== p2) { $('#err', d.el).textContent = 'Die beiden Eingaben sind verschieden.'; return; }
    try {
      const A = await withBusy('verschlüsselt …', () => K.archiveSeal({ probe: 'gespraeche', v: 1, exported: Date.now(), von: S.user.name || S.user.kuerzel, items: list.map(t => t.n) },
        { users: [{ role: 'lehrkraft', kuerzel: S.user.kuerzel, name: S.user.name, pub_key: S.keys.pub_key }], passphrase: p1, info: { art: 'gespraeche', n: list.length } }));
      const name = `Gespraeche_${new Date().toISOString().slice(0, 10)}.probe-gespraeche.json`;
      download(name, JSON.stringify(A)); await api('t_exported', { ids: list.map(t => t.id) }); d.close(); toast(`⇩ ${esc(name)} gespeichert`, 5000); viewTalks(H);
    } catch (e) { $('#err', d.el).textContent = e.message; }
  };
}
function openFile(H) {
  const { S, K, dialog, esc, pickFile, toast } = H;
  pickFile('.json,application/json', async f => {
    let A; try { A = JSON.parse(await f.text()); } catch (e) { toast('⚠ Keine gültige Datei'); return; }
    let data = null; try { data = await K.archiveOpen(A, { priv: S.priv, pub: S.keys.pub_key }); } catch (e) { toast('⚠ ' + esc(e.message)); return; }
    if (!data) { const pp = prompt('Diese Datei ist nicht für dein Konto verschlüsselt. Passphrase:'); if (!pp) return; try { data = await K.archiveOpen(A, { passphrase: pp }); } catch (e) { } if (!data) { toast('⚠ Passphrase falsch oder Datei beschädigt', 5000); return; } }
    if (data.probe !== 'gespraeche') { toast('⚠ Das ist keine Datei mit Gesprächsnotizen (Coaching-Dateien öffnest du im Reiter Coaching).', 5000); return; }
    const L = data.items.map(n => ({ n })).sort((a, b) => a.n.datum.localeCompare(b.n.datum));
    const d = dialog(`📂 Gesprächsnotizen von ${esc(data.von)}`, `<p class="help">exportiert am ${esc(deDate(new Date(data.exported)))} · ${L.length} Notizen <button class="btn sm" id="pa">🖨 Alle drucken</button></p>
      ${L.map(({ n }, i) => `<div class="t-row" data-i="${i}"><b>${esc(deDate(n.datum))}</b><span>${ARTEN[n.art]?.[0] || ''} ${esc(who(n))}</span><span class="help">${esc(n.thema || n.anlass || '')}</span><button class="btn sm">🖨</button></div>`).join('')}`, { wide: true });
    d.el.onclick = e => { if (e.target.closest('#pa')) return printTalks(H, L); const r = e.target.closest('[data-i]'); if (r && e.target.closest('button')) printTalks(H, [L[+r.dataset.i]]); };
  });
}

/* ---------- Schuljahresende: erinnern, nie selbst löschen ---------- */
export async function talksHint(H) {
  await syncPending(H);
  try { const L = await load(H), old = L.filter(t => Date.now() >= sjEnd(t.schuljahr)); if (old.length) yearEnd(H, old); } catch (e) { }
}
function yearEnd(H, old) {
  const { dialog, api, toast, esc } = H, ex = old.filter(t => t.exported).length;
  const d = dialog('⏰ Gesprächsnotizen: Schuljahr vorbei', `<p>${old.length} Gesprächsnotiz${old.length === 1 ? '' : 'en'} aus ${esc([...new Set(old.map(t => t.schuljahr))].join(', '))} (${ex} davon exportiert). Bitte <b>verschlüsselt exportieren</b> und danach <b>löschen</b>. Probe löscht nichts von selbst und erinnert dich bei jeder Anmeldung.</p>
    <div class="btns"><button class="btn pri" data-exp>⇩ Verschlüsselt exportieren</button><button class="btn danger" data-del>Löschen</button><button class="btn" data-close>Später erinnern</button></div>`);
  d.el.onclick = async e => {
    if (e.target.closest('[data-exp]')) { d.close(); exportDialog(H, old); return; }
    if (!e.target.closest('[data-del]')) return;
    if (ex < old.length && !confirm(`${old.length - ex} davon sind noch nicht exportiert. Trotzdem endgültig löschen?`)) return;
    if (!confirm(`${old.length} Gesprächsnotiz${old.length === 1 ? '' : 'en'} endgültig löschen?`)) return;
    await api('t_delete', { ids: old.map(t => t.id) }); d.close(); toast('🗑 gelöscht'); if (location.hash === '#/gespraeche') viewTalks(H);
  };
}

/* ---------- Demo: drei erfundene Gespräche ---------- */
async function demo(H) {
  const { S, api, K } = H, d = k => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
  const N = [
    { art: 'eltern', mit: 'Frau und Herr Sommer', klasse: '7z', teilnehmer: '', datum: d(-9), zeit: '17:30', ort: 'Sprechzimmer', anlass: 'Lernen / Leistung', thema: 'Mias Noten in Mathematik', ziele: 'Gemeinsames Bild von der Lernsituation, Unterstützung zu Hause klären.', notizen: 'Mia lernt viel, aber erst kurz vor den Schulaufgaben. Eltern berichten von Druck vor Prüfungen.', vereinbarungen: 'Mia schreibt vor jeder Schulaufgabe einen Lernplan (Mia, ab sofort). Rückmeldung an die Eltern nach der nächsten Schulaufgabe (Klassleitung).', wieder: d(12), informiert: ['Klassenleitung'] },
    { art: 'schueler', mit: 'Jonas Weber', klasse: '7z', teilnehmer: '', datum: d(-3), zeit: '10:15', ort: 'Klassenzimmer', anlass: 'Sozialverhalten / Konflikt', thema: 'Streit in der Pause', ziele: 'Konflikt klären, nächsten Schritt vereinbaren.', notizen: 'Streit mit einem Mitschüler über ein Fußballspiel, beide haben sich beleidigt.', vereinbarungen: 'Klärungsgespräch zu dritt am Freitag.', wieder: d(2), informiert: [] },
    { art: 'kollegium', mit: 'Herr Kunz (Mathematik)', klasse: '7z', teilnehmer: '', datum: d(-1), zeit: '13:05', ort: 'Lehrerzimmer', anlass: 'Organisation', thema: 'Förderstunde Mathematik', ziele: 'Wer braucht die Förderstunde?', notizen: 'Drei Kinder aus der 7z kommen ab nächster Woche.', vereinbarungen: 'Liste an das Sekretariat (Herr Kunz).', wieder: '', informiert: [] },
  ];
  for (const n of N) await api('t_save', { enc: await K.seal(S.keys.pub_key, { v: 1, lid: lid(), erledigt: false, ...n, updated: Date.now() }), datum: n.datum });
}
