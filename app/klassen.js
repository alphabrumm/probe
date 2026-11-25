// Probe – Klassen: Lerngruppe der Lehrkraft (Name, Fach, Namensliste) mit Notenübersicht.
// Die Namensliste ist mit dem Schlüssel der Lehrkraft verschlüsselt (wie die Klassenliste einer Prüfung); jede:r bekommt
// eine feste Kennung (sid), damit Noten auch nach Umbenennungen zusammenfinden. Prüfungen und Coachings übernehmen die Liste.
// Noten: Jede Auswertung legt eine verschlüsselte Notenübersicht ab (exams.notes_enc); Durchschnitte rechnet der Browser.
const $ = (s, r = document) => r.querySelector(s);
const nkey = r => `${r.n}|${r.v}`.toLowerCase().replace(/\s+/g, ' ').trim();
const newSid = () => [...crypto.getRandomValues(new Uint8Array(6))].map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 10);
const GROSS = new Set(['Schulaufgabe']), KLEIN = new Set(['AKL', 'Kurzarbeit']);
const KURZ = { Schulaufgabe: 'SA', Kurzarbeit: 'KA', AKL: 'AKL', 'Übungsprüfung': 'Üb' };
const fmt = (x, d = 2) => x == null || Number.isNaN(x) ? '–' : x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const mean = A => A.length ? A.reduce((s, x) => s + x, 0) / A.length : null;
const short = d => d ? new Date(d + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map(x => x.toString(16).padStart(2, '0')).join('');

/* ---------- Eigene Noten: mündlich, Referat, Beobachtung … (je Eintrag: wer, Art, Datum, Note, zählt als klein/groß/gar nicht) ---------- */
export const MART = [['Abfrage', 'Abfr.'], ['Unterrichtsbeitrag', 'UB'], ['Referat', 'Ref.'], ['Beobachtung', 'Beob.'], ['Projekt', 'Proj.'], ['Sonstiges', 'Sonst.']];
const MKURZ = Object.fromEntries(MART);
const ZAEHLT = [['k', 'kleiner Leistungsnachweis'], ['g', 'großer Leistungsnachweis'], ['0', 'zählt nicht (nur Notiz)']];
/** „2“, „2-“, „3+“, „2,5“ (Noten 1–6, Tendenz ±0,25) oder 0–15 (Notenpunkte); sonst null */
export function markVal(s, pkt) {
  s = String(s ?? '').trim().replace(',', '.').replace(/[–—−]/g, '-'); if (!s) return null;
  if (pkt) return /^\d{1,2}$/.test(s) && +s <= 15 ? +s : null;
  let m = s.match(/^([1-6])\s*([+-])$/); if (m) return Math.min(6, Math.max(1, +m[1] + (m[2] === '-' ? 0.25 : -0.25)));
  return /^[1-6](\.\d{1,2})?$/.test(s) && +s <= 6 ? +s : null;
}
async function openMarks(H, enc) {
  const { S, K } = H; if (!enc) return { v: 1, e: [], map: {}, ov: {} }; const m = await K.open(S.priv, enc);
  return { v: 1, e: Array.isArray(m?.e) ? m.e : [], map: m?.map && typeof m.map === 'object' ? m.map : {}, ov: m?.ov && typeof m.ov === 'object' ? m.ov : {} };
}
/* ---------- PlanPad: Noten mit Notiz, Art und Datum kommen verschlüsselt über die Ablage (drop.php) ---------- */
const PP_ART = { beitrag: 'Unterrichtsbeitrag', beobachtung: 'Beobachtung', 'präsentation': 'Referat', referat: 'Referat', abfrage: 'Abfrage', projekt: 'Projekt' };
const ppKey = x => `${x.v || ''}|${x.n || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
/** PlanPad-Einträge als eigene Noten (nur lesen; „zählt als“ lässt sich in Probe ändern), mit Zuordnung zu den Namen der Klasse */
function ppMarks(D) {
  const L = D.pp?.items || [], out = [], open = new Map(), M = D.marks;
  const byKey = new Map(D.roster.map(r => [nkey(r), r.sid])), low = s => String(s || '').toLowerCase().trim();
  const byV = x => { const c = D.roster.filter(r => low(r.v) === low(x.v) && (!x.n || low(r.n).startsWith(low(x.n).replace(/\.$/, '')))); return c.length === 1 ? c[0].sid : null; }; // nur Vorname (oder Nachname abgekürzt) – wenn eindeutig
  for (const x of L) {
    const k = ppKey(x), sid = M.map[k] || byKey.get(nkey({ n: x.n || '', v: x.v || '' })) || byV(x);
    if (!sid || !D.roster.some(r => r.sid === sid)) { open.set(k, x); continue; }
    const kind = String(x.k || 'Beitrag'), art = PP_ART[kind.toLowerCase()] || 'Sonstiges';
    out.push({ id: 'pp:' + x.id, sid, art, d: String(x.d || '').slice(0, 10), n: String(x.g || ''), t: (art === 'Sonstiges' ? kind + (x.t ? ': ' : '') : '') + (x.t || ''), w: M.ov['pp:' + x.id] || 'k', src: 'pp' });
  }
  return { list: out, open: [...open.values()] };
}
/** Änderung speichern: op ändert die Liste; hat ein anderes Gerät dazwischen gespeichert, auf dessen Stand noch einmal anwenden */
export async function saveMarks(H, D, op) {
  const { S, api, K } = H;
  for (let t = 0; t < 4; t++) {
    const M = structuredClone(D.marks); op(M.e, M);
    const r = await api('cl_marks', { id: D.c.id, rev: D.rev, marks_enc: await K.seal(S.keys.pub_key, M) });
    if (!r.conflict) { D.marks = M; D.rev = r.rev; return; }
    D.marks = await openMarks(H, r.marks_enc); D.rev = r.marks_rev;
  }
  throw new Error('Speichern gerade nicht möglich – bitte neu laden.');
}

/** Namensliste übernehmen: gleiche Namen behalten ihre Kennung */
export function keepSids(old = [], L = []) {
  const m = new Map(old.map(r => [nkey(r), r.sid]));
  return L.map(r => ({ n: r.n, v: r.v, sid: m.get(nkey(r)) || r.sid || newSid() }));
}
export async function loadClass(H, id) {
  const { S, api, K } = H, r = await api('cl_get', { id });
  let roster = r.roster_enc ? await K.open(S.priv, r.roster_enc) : [];
  if (roster.some(x => !x.sid)) { // Liste aus einer Prüfung übernommen: feste Kennungen vergeben (für die eigenen Noten)
    roster = keepSids([], roster); const c = r.class;
    try { await api('cl_save', { id: c.id, name: c.name, fach_id: c.fach_id || 0, gewicht: c.gewicht, roster_enc: await K.seal(S.keys.pub_key, roster), roster_n: roster.length }); } catch (er) { }
  }
  let marks = { v: 1, e: [], map: {}, ov: {} }; try { marks = await openMarks(H, r.marks_enc); } catch (er) { }
  let pp = null; try { if (r.drop?.data_enc) pp = await K.open(S.priv, r.drop.data_enc); } catch (er) { pp = { error: true, items: [] }; }
  for (const e of r.exams) { try { e.notes = e.notes_enc ? await K.open(S.priv, e.notes_enc) : null; } catch (er) { e.notes = null; } delete e.notes_enc; }
  return { c: r.class, roster, exams: r.exams, marks, rev: r.marks_rev || 0, drop: r.drop, pp };
}

/* ---------- Anlegen und Bearbeiten ---------- */
export async function classForm(H, D, preset = {}) {
  const { S, api, K, dialog, esc, field, toast, withBusy, parseNames, pickFile } = H, c = D?.c;
  const C = await api('catalog'), F = [...(C.faecher || [])];
  const names = (D?.roster || preset.roster || []).map(r => `${r.n}, ${r.v}`).join('\n'), fid = c?.fach_id ?? preset.fach_id ?? '';
  const fname = c?.fach || preset.fach; if (fid && fname && !F.some(f => +f.id === +fid)) F.push({ id: fid, name: fname }); // Fach, das nicht (mehr) unter „Meine Fächer“ steht
  const d = dialog(c ? 'Klasse bearbeiten' : 'Neue Klasse', `
    <div class="row">${field('Klasse', `<input type="text" id="cn" value="${esc(c?.name || preset.name || '')}" placeholder="z. B. 8b" maxlength="20" autocapitalize="off">`)}
    ${field('Fach (optional)', `<select id="cf"><option value="">– alle Fächer –</option>${F.map(f => `<option value="${f.id}"${+f.id === +fid ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`, 'Unterrichtest du die Klasse in zwei Fächern, lege sie zweimal an.')}</div>
    ${field('Schüler:innen', `<textarea id="cl" rows="8" placeholder="Nachname, Vorname – je Zeile, oder CSV einfügen">${esc(names)}</textarea>`, 'Wird verschlüsselt gespeichert. Neue Prüfungen und Coachings dieser Klasse übernehmen die Liste.')}
    <div class="btns" style="margin:-4px 0 10px"><button class="btn sm" id="csv">⤒ Klassenliste einlesen</button><span class="help">CSV oder Text aus der Schulverwaltung (z. B. ASV) oder aus Moodle</span></div>
    ${field('Gewichtung für den Durchschnitt', `<select id="gw">${[[1, '1 : 1'], [2, '2 : 1 (üblich)'], [3, '3 : 1']].map(([v, t]) => `<option value="${v}"${(c?.gewicht || 2) === v ? ' selected' : ''}>große : kleine Leistungsnachweise = ${t}</option>`).join('')}</select>`, 'Groß: Schulaufgaben. Klein: Kurzarbeiten und AKL. Übungsprüfungen zählen nicht.')}
    <div class="err" id="err"></div><button class="btn pri" id="go">${c ? 'Speichern' : 'Klasse anlegen'}</button>`, { wide: true });
  $('#csv', d.el).onclick = () => pickFile('.csv,.txt,text/csv,text/plain', async f => { const L = parseNames(await f.text()); if (!L.length) { $('#err', d.el).textContent = 'In der Datei wurden keine Namen erkannt.'; return; } $('#cl', d.el).value = L.map(r => `${r.n}, ${r.v}`).join('\n'); toast(`✓ ${L.length} Namen eingelesen`); });
  $('#go', d.el).onclick = async () => {
    const name = $('#cn', d.el).value.trim(); if (!name) { $('#err', d.el).textContent = 'Bitte den Namen der Klasse eintragen.'; return; }
    const R = keepSids(D?.roster || [], parseNames($('#cl', d.el).value));
    try {
      const r = await withBusy('verschlüsselt …', async () => api('cl_save', { id: c?.id, name, fach_id: +$('#cf', d.el).value || 0, gewicht: +$('#gw', d.el).value, schuljahr: c ? undefined : (preset.schuljahr || S.sj), roster_enc: await K.seal(S.keys.pub_key, R), roster_n: R.length }));
      d.close(); toast(c ? '✓ gespeichert' : `✓ Klasse ${esc(name)} angelegt${r.class.n_exams ? ` – ${r.class.n_exams} vorhandene Prüfung${r.class.n_exams === 1 ? '' : 'en'} zugeordnet` : ''}`, 5000);
      location.hash = '#/k/' + r.class.id; if (c) viewClass(H, c.id);
    } catch (er) { $('#err', d.el).textContent = er.message; }
  };
}

/* ---------- Eine Klasse: Notenübersicht und Prüfungen ---------- */
export async function viewClass(H, id, keep) {
  const { main, esc } = H;
  if (!keep) main.innerHTML = '<p class="help">entschlüsselt …</p>';
  let D; try { D = keep || await loadClass(H, id); } catch (er) { main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a><p class="err">${esc(er.message)}</p>`; return; }
  drawClass(H, D);
}
function gradeModel(D) {
  const { roster, exams, c } = D, gw = c.gewicht || 2;
  const cols = exams.filter(e => e.art !== 'Übungsprüfung' || e.notes); // Übungsprüfungen nur, wenn ausgewertet (zählen nicht)
  const bySid = new Map(roster.map((r, i) => [r.sid, i])), byName = new Map(roster.map((r, i) => [nkey(r), i]));
  const cell = roster.map(() => ({})), extra = [];
  for (const e of cols) for (const row of e.notes?.rows || []) {
    const i = row.sid && bySid.has(row.sid) ? bySid.get(row.sid) : byName.get(nkey(row));
    if (i == null) extra.push({ e, row }); else cell[i][e.id] = row;
  }
  const skalen = new Set(cols.filter(e => e.notes).map(e => e.skala)), pkt = skalen.has('punkte') && !skalen.has('noten');
  const man = roster.map(() => []), lost = [];
  const PP = ppMarks(D);
  for (const m of [...D.marks.e, ...PP.list].sort((a, b) => (a.d || '').localeCompare(b.d || ''))) { const i = bySid.get(m.sid); if (i == null) lost.push(m); else man[i].push(m); }
  const arts = MART.map(a => a[0]).filter(a => man.some(L => L.some(m => m.art === a)));
  const vals = (i, w, set) => [...cols.filter(e => set.has(e.art)).map(e => cell[i][e.id]?.note), ...man[i].filter(m => m.w === w).map(m => markVal(m.n, pkt))].filter(x => x != null);
  const avgG = i => mean(vals(i, 'g', GROSS)), avgK = i => mean(vals(i, 'k', KLEIN));
  const total = i => { const g = avgG(i), k = avgK(i); return g == null ? k : k == null ? g : (gw * g + k) / (gw + 1); };
  return { gw, cols, cell, extra, skalen, pkt, man, lost, arts, avgG, avgK, total, ppOpen: PP.open };
}
function drawClass(H, D) {
  const { S, main, esc, api, toast, fmtDate } = H;
  const { c, roster, exams } = D, G = gradeModel(D), { gw, cols, cell, extra, skalen, pkt, man, arts } = G;
  const head = e => `<th class="k-ex"><a href="#/p/${e.id}" title="${esc(`${e.art} ${e.fach} vom ${fmtDate(e.datum)}${e.titel ? ' – ' + e.titel : ''}`)}">${esc(KURZ[e.art] || e.art)}<br><span>${esc(short(e.datum))}</span></a></th>`;
  const val = (e, x) => !e.notes ? (['beendet', 'veroeffentlicht'].includes(e.status) ? '<span class="help" title="Auswertung öffnen, dann erscheinen die Noten">?</span>' : '<span class="help">·</span>') : x ? `<b>${x.note}</b>${x.pending ? '<sup title="noch nicht alles bewertet">*</sup>' : ''}` : '<span class="help">–</span>';
  const mk = m => `<span class="k-mk${m.w === 'g' ? ' g' : m.w === '0' ? ' o' : ''}${m.src ? ' pp' : ''}" title="${esc(`${m.art} ${fmtDate(m.d)}${m.t ? ' – ' + m.t : ''}${m.w === 'g' ? ' (groß)' : m.w === '0' ? ' (zählt nicht)' : ''}${m.src ? ' · aus PlanPad' : ''}`)}">${esc(m.n)}</span>`;
  const pend = cols.filter(e => !e.notes && ['beendet', 'veroeffentlicht'].includes(e.status));
  main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a>
    <h1>${esc(c.name)}${c.fach ? ' ' + esc(c.fach) : ''}</h1><p class="sub">Schuljahr ${esc(c.schuljahr)} · ${roster.length} Schüler:innen · ${exams.length} Prüfung${exams.length === 1 ? '' : 'en'} <span class="c-lock">🔒 Namen und Noten nur für dich lesbar</span></p>
    <div class="bar"><button class="btn pri" id="kx">＋ Neue Prüfung</button><span class="sp"></span><button class="btn" id="ked">✎ Klasse bearbeiten</button><button class="btn ghost danger" id="kdel">🗑</button></div>
    <section class="card"><div class="bar"><h2 style="margin:0">Noten</h2>${roster.length ? '<button class="btn sm" id="kmk">＋ Noten eintragen</button>' : ''}<button class="btn sm${D.drop ? ' pp-on' : ''}" id="kpp" title="Noten mit Notizen aus PlanPad übernehmen">${D.drop ? `⇄ PlanPad${D.pp?.items ? ` · ${D.pp.items.length}` : ''}` : '⇄ PlanPad verbinden'}</button><span class="sp"></span><span class="help">Ø groß : klein = ${gw} : 1</span></div>
      ${!roster.length ? '<p class="help">Noch keine Namen – über „Klasse bearbeiten“ eintragen oder die Klassenliste einlesen.</p>'
        : `<div class="scroll-x"><table class="k-tab"><tr><th>Name</th>${cols.map(head).join('')}${arts.map(a => `<th class="k-man" title="${esc(a)} (eigene Noten)">${esc(MKURZ[a])}</th>`).join('')}<th class="k-avg">Ø groß</th><th class="k-avg">Ø klein</th><th class="k-avg">Gesamt</th></tr>
        ${roster.map((r, i) => `<tr><td class="k-who" data-i="${i}" title="Noten von ${esc(r.v)} ${esc(r.n)} ansehen und eintragen"><b>${esc(r.n)}</b>, ${esc(r.v)}</td>${cols.map(e => `<td>${val(e, cell[i][e.id])}</td>`).join('')}${arts.map(a => `<td class="k-man" data-i="${i}">${man[i].filter(m => m.art === a).map(mk).join(' ') || '<span class="help">·</span>'}</td>`).join('')}<td class="k-avg">${fmt(G.avgG(i))}</td><td class="k-avg">${fmt(G.avgK(i))}</td><td class="k-avg"><b>${fmt(G.total(i))}</b></td></tr>`).join('')}
        <tr class="k-foot"><td>Klassen-Ø</td>${cols.map(e => `<td>${e.notes ? fmt(mean(e.notes.rows.map(x => x.note).filter(x => x != null)), 1) : ''}</td>`).join('')}${arts.map(a => `<td>${fmt(mean(man.flatMap(L => L.filter(m => m.art === a && m.w !== '0').map(m => markVal(m.n, pkt))).filter(x => x != null)), 1)}</td>`).join('')}<td class="k-avg"></td><td class="k-avg"></td><td class="k-avg">${fmt(mean(roster.map((_, i) => G.total(i)).filter(x => x != null)))}</td></tr></table></div>
        <p class="help">Auf einen Namen tippen: alle Noten dieser Person, eigene Noten eintragen oder ändern. ${pkt ? 'Notenpunkte 0–15. ' : skalen.size > 1 ? '⚠ Noten und Notenpunkte gemischt – Durchschnitte nur bedingt sinnvoll. ' : 'Tendenzen zählen ±0,25 (2- = 2,25). '}„–“ nicht teilgenommen · „·“ noch nicht ausgewertet · „?“ ausgewertet, aber die Noten fehlen noch: Auswertung einmal öffnen${pend.length ? ` (${pend.map(e => `<a href="#/p/${e.id}">${esc(KURZ[e.art] || e.art)} ${esc(short(e.datum))}</a>`).join(', ')})` : ''} · * noch nicht alles bewertet · Übungsprüfungen zählen nicht · <span class="k-mk g">fett</span> groß, <span class="k-mk o">grau</span> zählt nicht${D.drop ? ', <span class="k-mk pp">blau</span> aus PlanPad' : ''}.</p>
        ${extra.length ? `<p class="help">⚠ Nicht in der Namensliste: ${extra.map(x => `${esc(x.row.v)} ${esc(x.row.n)} (${esc(KURZ[x.e.art] || x.e.art)} ${esc(short(x.e.datum))}: ${x.row.note})`).join(', ')} – Name in der Auswertung zuordnen oder in der Klasse ergänzen.</p>` : ''}
        ${G.ppOpen.length ? `<p class="help">⚠ PlanPad: ${G.ppOpen.length} Name${G.ppOpen.length === 1 ? '' : 'n'} nicht zugeordnet (${G.ppOpen.slice(0, 4).map(x => esc(`${x.v} ${x.n || ''}`.trim())).join(', ')}${G.ppOpen.length > 4 ? ' …' : ''}) <button class="btn sm" id="kmap">Zuordnen</button></p>` : ''}
        ${D.pp?.error ? '<p class="help">⚠ Der Stand aus PlanPad ließ sich nicht entschlüsseln.</p>' : ''}
        ${G.lost.length ? `<p class="help">⚠ ${G.lost.length} eigene Note${G.lost.length === 1 ? '' : 'n'} gehör${G.lost.length === 1 ? 't' : 'en'} zu Namen, die nicht mehr in der Liste stehen.</p>` : ''}`}
    </section>
    <h2>Prüfungen</h2>
    ${exams.length ? `<div class="tiles">${exams.slice().reverse().map(e => `<a class="tile" href="#/p/${e.id}"><span class="k">${esc(e.fach)} · ${esc(e.art)}</span><span class="t">${esc(e.titel || 'ohne Titel')}</span><span class="m">${esc(fmtDate(e.datum))}</span><span class="s">${H.statusChip(e)}</span></a>`).join('')}</div>` : '<p class="help">Noch keine Prüfung in dieser Klasse.</p>'}`;
  $('#kx').onclick = () => H.examForm(null, { ...c, roster });
  $('#ked').onclick = () => classForm(H, D);
  if ($('#kmk')) $('#kmk').onclick = () => massDialog(H, D, G);
  $('#kpp').onclick = () => ppDialog(H, D);
  if ($('#kmap')) $('#kmap').onclick = () => mapDialog(H, D, G);
  main.querySelectorAll('.k-who, td.k-man').forEach(td => td.onclick = () => personDialog(H, D, +td.dataset.i));
  $('#kdel').onclick = async () => {
    if (exams.length) return toast(`Die Klasse enthält noch ${exams.length} Prüfung${exams.length === 1 ? '' : 'en'}. Lösche sie zuerst oder ordne sie einer anderen Klasse zu.`, 6000);
    if (!confirm(`Klasse ${c.name} löschen? Die Namensliste und die eigenen Noten werden gelöscht.`)) return;
    try { await api('cl_delete', { id: c.id }); toast('🗑 Klasse gelöscht'); location.hash = '#/'; } catch (er) { toast('⚠ ' + esc(er.message)); }
  };
}
const artSel = (v = 'Abfrage') => `<select class="m-art">${MART.map(([a]) => `<option${a === v ? ' selected' : ''}>${a}</option>`).join('')}</select>`;
const wSel = (v = 'k') => `<select class="m-w">${ZAEHLT.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
/** Abfrage und Referat zählen klein, Beobachtungen meist nur als Notiz */
const wFor = art => art === 'Beobachtung' ? '0' : 'k';

/** Für mehrere auf einmal: Art, Datum, Thema, dann je Name eine Note */
function massDialog(H, D, G) {
  const { dialog, esc, field, toast, withBusy } = H, { roster } = D;
  const d = dialog('Noten eintragen', `
    <div class="row">${field('Art', artSel())}${field('Datum', `<input type="date" class="m-d" value="${today()}">`)}${field('Zählt als', wSel())}</div>
    ${field('Thema (optional)', '<input type="text" class="m-t" maxlength="120" placeholder="z. B. Referat Hebelgesetz">')}
    <div class="m-list">${roster.map((r, i) => `<label class="m-row"><span><b>${esc(r.n)}</b>, ${esc(r.v)}</span><input type="text" class="m-n" data-i="${i}" maxlength="4" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="–"></label>`).join('')}</div>
    <p class="help">${G.pkt ? 'Notenpunkte 0–15.' : 'Noten 1–6, auch mit Tendenz (2-, 3+) oder Komma (2,5).'} Leere Felder werden übersprungen.</p>
    <div class="err" id="err"></div><button class="btn pri" id="go">Speichern</button>`, { wide: true });
  const art = $('.m-art', d.el), w = $('.m-w', d.el);
  art.onchange = () => { w.value = wFor(art.value); };
  d.el.querySelectorAll('.m-n').forEach(inp => inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); const n = d.el.querySelector(`.m-n[data-i="${+inp.dataset.i + 1}"]`); (n || $('#go', d.el)).focus(); } });
  $('#go', d.el).onclick = async () => {
    const dt = $('.m-d', d.el).value || today(), t = $('.m-t', d.el).value.trim(), add = [], bad = [];
    d.el.querySelectorAll('.m-n').forEach(inp => { inp.classList.remove('bad'); const v = inp.value.trim(); if (!v) return; if (markVal(v, G.pkt) == null) { inp.classList.add('bad'); bad.push(inp); return; } add.push({ id: newId(), sid: roster[+inp.dataset.i].sid, art: art.value, d: dt, n: v.replace('.', ','), t, w: w.value }); });
    if (bad.length) { $('#err', d.el).textContent = bad.length === 1 ? 'Eine Eingabe ist keine gültige Note.' : `${bad.length} Eingaben sind keine gültigen Noten.`; bad[0].focus(); return; }
    if (!add.length) { $('#err', d.el).textContent = 'Noch keine Note eingetragen.'; return; }
    try { await withBusy('verschlüsselt …', () => saveMarks(H, D, L => L.push(...add))); d.close(); toast(`✓ ${add.length} Note${add.length === 1 ? '' : 'n'} gespeichert`); drawClass(H, D); }
    catch (er) { $('#err', d.el).textContent = er.message; }
  };
  setTimeout(() => $('.m-n', d.el)?.focus(), 50);
}

/** Eine Person: Prüfungsnoten, eigene Noten (ändern, löschen) und neue eintragen */
function personDialog(H, D, i) {
  const { dialog, esc, field, toast, withBusy, fmtDate } = H, r = D.roster[i];
  let G = gradeModel(D), editing = null;
  const d = dialog(`${r.v} ${r.n}`, '<div id="pd"></div>', { wide: true });
  const draw = () => {
    G = gradeModel(D); const ex = G.cols.filter(e => G.cell[i][e.id]), M = G.man[i].slice().reverse(), e0 = M.find(m => m.id === editing);
    $('#pd', d.el).innerHTML = `
      <p class="sub" style="margin-top:0">Ø groß <b>${fmt(G.avgG(i))}</b> · Ø klein <b>${fmt(G.avgK(i))}</b> · Gesamt <b>${fmt(G.total(i))}</b></p>
      ${ex.length ? `<h3>Prüfungen</h3><ul class="m-ul">${ex.map(e => `<li><span>${esc(e.art)} · ${esc(fmtDate(e.datum))}${e.titel ? ' · ' + esc(e.titel) : ''}</span><b>${G.cell[i][e.id].note}</b></li>`).join('')}</ul>` : ''}
      <h3>Eigene Noten</h3>
      ${M.length ? `<ul class="m-ul">${M.map(m => m.src ? `<li><span>${esc(m.art)} · ${esc(fmtDate(m.d))}${m.t ? ' · ' + esc(m.t) : ''} <small class="chip">PlanPad</small>${markVal(m.n, G.pkt) == null ? ' <i>(keine Note erkannt)</i>' : ''}</span><b>${esc(m.n)}</b>${wSel(m.w).replace('class="m-w"', `class="m-w sm" data-ov="${m.id}" title="zählt als"`).replace('kleiner Leistungsnachweis', 'klein').replace('großer Leistungsnachweis', 'groß').replace('zählt nicht (nur Notiz)', 'zählt nicht')}</li>`
        : `<li${m.id === editing ? ' class="on"' : ''}><span>${esc(m.art)} · ${esc(fmtDate(m.d))}${m.t ? ' · ' + esc(m.t) : ''}${m.w === 'g' ? ' · <i>groß</i>' : m.w === '0' ? ' · <i>zählt nicht</i>' : ''}</span><b>${esc(m.n)}</b><button class="btn sm ghost" data-ed="${m.id}" title="ändern">✎</button><button class="btn sm ghost danger" data-del="${m.id}" title="löschen">🗑</button></li>`).join('')}</ul>${M.some(m => m.src) ? '<p class="help">Noten aus PlanPad änderst du in PlanPad; hier nur, wie sie zählen.</p>' : ''}` : '<p class="help">Noch keine.</p>'}
      <h3>${e0 ? 'Note ändern' : 'Neue Note'}</h3>
      <div class="row">${field('Art', artSel(e0?.art))}${field('Datum', `<input type="date" class="m-d" value="${e0?.d || today()}">`)}${field('Note', `<input type="text" class="m-n" maxlength="4" autocomplete="off" autocapitalize="off" value="${esc(e0?.n || '')}" placeholder="${G.pkt ? '0–15' : 'z. B. 2-'}">`)}</div>
      <div class="row">${field('Thema (optional)', `<input type="text" class="m-t" maxlength="120" value="${esc(e0?.t || '')}">`)}${field('Zählt als', wSel(e0?.w))}</div>
      <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">${e0 ? 'Änderung speichern' : 'Note speichern'}</button>${e0 ? '<button class="btn" id="cx">Abbrechen</button>' : ''}</div>`;
    const art = $('.m-art', d.el), w = $('.m-w:not([data-ov])', d.el); if (!e0) art.onchange = () => { w.value = wFor(art.value); };
    d.el.querySelectorAll('[data-ov]').forEach(s => s.onchange = async () => {
      const id = s.dataset.ov, v = s.value;
      try { await withBusy('verschlüsselt …', () => saveMarks(H, D, (L, M) => { if (v === 'k') delete M.ov[id]; else M.ov[id] = v; })); draw(); drawClass(H, D); toast('✓ gespeichert'); } catch (er) { $('#err', d.el).textContent = er.message; }
    });
    d.el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { editing = b.dataset.ed; draw(); $('.m-n', d.el).focus(); });
    d.el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Diese Note löschen?')) return; const id = b.dataset.del;
      try { await withBusy('verschlüsselt …', () => saveMarks(H, D, L => { const k = L.findIndex(m => m.id === id); if (k >= 0) L.splice(k, 1); })); if (editing === id) editing = null; draw(); drawClass(H, D); toast('🗑 gelöscht'); } catch (er) { $('#err', d.el).textContent = er.message; }
    });
    if ($('#cx', d.el)) $('#cx', d.el).onclick = () => { editing = null; draw(); };
    $('.m-n', d.el).onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('#go', d.el).click(); } };
    $('#go', d.el).onclick = async () => {
      const n = $('.m-n', d.el).value.trim(); if (markVal(n, G.pkt) == null) { $('#err', d.el).textContent = G.pkt ? 'Bitte Notenpunkte 0–15 eintragen.' : 'Bitte eine Note 1–6 eintragen (auch 2-, 3+ oder 2,5).'; return; }
      const m = { id: editing || newId(), sid: r.sid, art: art.value, d: $('.m-d', d.el).value || today(), n: n.replace('.', ','), t: $('.m-t', d.el).value.trim(), w: w.value };
      try { await withBusy('verschlüsselt …', () => saveMarks(H, D, L => { const k = L.findIndex(x => x.id === m.id); if (k >= 0) L[k] = m; else L.push(m); })); editing = null; draw(); drawClass(H, D); toast('✓ gespeichert'); }
      catch (er) { $('#err', d.el).textContent = er.message; }
    };
  };
  draw();
}

/* ---------- PlanPad verbinden ---------- */
const b64u = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function ppDialog(H, D) {
  const { S, api, dialog, esc, toast, fmtDate, withBusy } = H, c = D.c, name = `${c.name}${c.fach ? ' ' + c.fach : ''}`;
  const when = t => t ? new Date(t * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const d = dialog('PlanPad verbinden', '<div id="ppd"></div>', { wide: true });
  const show = code => {
    $('#ppd', d.el).innerHTML = `
      ${code ? `<p><b>Verbindungscode für ${esc(name)}</b> – in PlanPad in der Klasse unter ☰ Klasse → „Mit Probe verbinden“ einfügen:</p>
        <textarea id="ppc" rows="4" readonly class="mono" style="width:100%;font-size:12px">${esc(code)}</textarea>
        <div class="btns"><button class="btn pri" id="ppcopy">Code kopieren</button></div>
        <p class="help">Der Code erscheint nur jetzt. Er erlaubt PlanPad nur, Noten in diese Klasse zu <b>schreiben</b> – lesen kann damit niemand etwas.</p>`
      : D.drop ? `<p>Verbunden seit ${esc(when(D.drop.created))}. ${D.drop.updated ? `Zuletzt empfangen: <b>${esc(when(D.drop.updated))}</b> · ${D.pp?.items?.length ?? 0} Noten.` : 'Aus PlanPad ist noch nichts angekommen.'}</p>`
      : `<p>PlanPad schickt die <b>Noten mit Notiz, Art und Datum</b> dieser Klasse hierher. Sie erscheinen in der Notentabelle beim passenden Namen.</p>`}
      <ul class="help" style="margin:8px 0 12px;padding-left:18px">
        <li>Nur Noten, keine anderen Notizen, Fotos, Sitzpläne oder Beobachtungen.</li>
        <li>PlanPad verschlüsselt vor dem Senden mit deinem Probe-Schlüssel. Der Server sieht nur Zeitpunkt und Größe.</li>
        <li>Nur in eine Richtung: Probe schickt nichts an PlanPad. Gesendet wird der jeweils aktuelle Stand (Änderungen und Löschungen in PlanPad kommen mit).</li>
      </ul>
      <div class="btns">${D.drop ? '<button class="btn" id="ppnew">Neuen Code erzeugen</button><button class="btn ghost danger" id="ppdel">Verbindung trennen</button>' : '<button class="btn pri" id="ppnew">Verbindungscode erzeugen</button>'}</div>`;
    if ($('#ppcopy', d.el)) $('#ppcopy', d.el).onclick = async () => { try { await navigator.clipboard.writeText(code); toast('✓ kopiert'); } catch (er) { $('#ppc', d.el).select(); document.execCommand('copy'); toast('✓ kopiert'); } };
    if ($('#ppnew', d.el)) $('#ppnew', d.el).onclick = async () => {
      if (D.drop && !confirm('Neuen Code erzeugen? Der bisherige gilt dann nicht mehr – PlanPad muss neu verbunden werden.')) return;
      try {
        const r = await withBusy('…', () => api('cl_drop_new', { id: c.id }));
        const cd = 'PROBE1.' + b64u(JSON.stringify({ v: 1, u: new URL('drop.php', location.href).href, t: r.token, k: S.keys.pub_key, c: name }));
        D.drop = { created: Math.floor(Date.now() / 1000), updated: null, n: 0 }; D.pp = null; show(cd); drawClass(H, D);
      } catch (er) { toast('⚠ ' + esc(er.message)); }
    };
    if ($('#ppdel', d.el)) $('#ppdel', d.el).onclick = async () => {
      if (!confirm('Verbindung zu PlanPad trennen? Die übernommenen PlanPad-Noten verschwinden aus der Tabelle.')) return;
      try { await api('cl_drop_del', { id: c.id }); D.drop = null; D.pp = null; d.close(); drawClass(H, D); toast('Verbindung getrennt'); } catch (er) { toast('⚠ ' + esc(er.message)); }
    };
  };
  show(null);
}
/** PlanPad-Namen, die nicht von selbst passen (z. B. Spitznamen), einem Namen der Klasse zuordnen */
function mapDialog(H, D, G) {
  const { dialog, esc, toast, withBusy } = H;
  const opts = `<option value="">– nicht zuordnen –</option>${D.roster.map(r => `<option value="${esc(r.sid)}">${esc(r.n)}, ${esc(r.v)}</option>`).join('')}`;
  const d = dialog('PlanPad-Namen zuordnen', `<p class="help">Diese Namen aus PlanPad stehen so nicht in der Namensliste der Klasse.</p>
    <div class="m-list">${G.ppOpen.map((x, i) => `<label class="m-row"><span><b>${esc(x.n || '')}</b>${x.n ? ', ' : ''}${esc(x.v || '')}</span><select data-i="${i}">${opts}</select></label>`).join('')}</div>
    <div class="err" id="err"></div><button class="btn pri" id="go">Speichern</button>`, { wide: true });
  $('#go', d.el).onclick = async () => {
    const set = [...d.el.querySelectorAll('select[data-i]')].filter(s => s.value).map(s => [ppKey(G.ppOpen[+s.dataset.i]), s.value]);
    if (!set.length) { d.close(); return; }
    try { await withBusy('verschlüsselt …', () => saveMarks(H, D, (L, M) => { for (const [k, v] of set) M.map[k] = v; })); d.close(); drawClass(H, D); toast(`✓ ${set.length} zugeordnet`); }
    catch (er) { $('#err', d.el).textContent = er.message; }
  };
}
