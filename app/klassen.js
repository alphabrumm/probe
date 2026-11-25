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

/** Namensliste übernehmen: gleiche Namen behalten ihre Kennung */
export function keepSids(old = [], L = []) {
  const m = new Map(old.map(r => [nkey(r), r.sid]));
  return L.map(r => ({ n: r.n, v: r.v, sid: m.get(nkey(r)) || r.sid || newSid() }));
}
export async function loadClass(H, id) {
  const { S, api, K } = H, r = await api('cl_get', { id });
  const roster = r.roster_enc ? await K.open(S.priv, r.roster_enc) : [];
  for (const e of r.exams) { try { e.notes = e.notes_enc ? await K.open(S.priv, e.notes_enc) : null; } catch (er) { e.notes = null; } delete e.notes_enc; }
  return { c: r.class, roster, exams: r.exams };
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
export async function viewClass(H, id) {
  const { S, main, esc, api, toast, fmtDate } = H;
  main.innerHTML = '<p class="help">entschlüsselt …</p>';
  let D; try { D = await loadClass(H, id); } catch (er) { main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a><p class="err">${esc(er.message)}</p>`; return; }
  const { c, roster, exams } = D, gw = c.gewicht || 2;
  const cols = exams.filter(e => e.art !== 'Übungsprüfung' || e.notes); // Übungsprüfungen nur, wenn ausgewertet (zählen nicht)
  const bySid = new Map(roster.map((r, i) => [r.sid, i])), byName = new Map(roster.map((r, i) => [nkey(r), i]));
  const cell = roster.map(() => ({})), extra = [];
  for (const e of cols) for (const row of e.notes?.rows || []) {
    const i = row.sid && bySid.has(row.sid) ? bySid.get(row.sid) : byName.get(nkey(row));
    if (i == null) extra.push({ e, row }); else cell[i][e.id] = row;
  }
  const skalen = new Set(cols.filter(e => e.notes).map(e => e.skala)), pkt = skalen.has('punkte') && !skalen.has('noten');
  const avg = (i, set) => mean(cols.filter(e => set.has(e.art)).map(e => cell[i][e.id]?.note).filter(x => x != null));
  const total = i => { const g = avg(i, GROSS), k = avg(i, KLEIN); return g == null ? k : k == null ? g : (gw * g + k) / (gw + 1); };
  const head = e => `<th class="k-ex"><a href="#/p/${e.id}" title="${esc(`${e.art} ${e.fach} vom ${fmtDate(e.datum)}${e.titel ? ' – ' + e.titel : ''}`)}">${esc(KURZ[e.art] || e.art)}<br><span>${esc(short(e.datum))}</span></a></th>`;
  const val = (e, x) => !e.notes ? (['beendet', 'veroeffentlicht'].includes(e.status) ? '<span class="help" title="Auswertung öffnen, dann erscheinen die Noten">?</span>' : '<span class="help">·</span>') : x ? `<b>${x.note}</b>${x.pending ? '<sup title="noch nicht alles bewertet">*</sup>' : ''}` : '<span class="help">–</span>';
  const pend = cols.filter(e => !e.notes && ['beendet', 'veroeffentlicht'].includes(e.status));
  main.innerHTML = `<a class="back" href="#/">‹ Meine Prüfungen</a>
    <h1>${esc(c.name)}${c.fach ? ' ' + esc(c.fach) : ''}</h1><p class="sub">Schuljahr ${esc(c.schuljahr)} · ${roster.length} Schüler:innen · ${exams.length} Prüfung${exams.length === 1 ? '' : 'en'} <span class="c-lock">🔒 Namen und Noten nur für dich lesbar</span></p>
    <div class="bar"><button class="btn pri" id="kx">＋ Neue Prüfung</button><span class="sp"></span><button class="btn" id="ked">✎ Klasse bearbeiten</button><button class="btn ghost danger" id="kdel">🗑</button></div>
    <section class="card"><div class="bar"><h2 style="margin:0">Noten</h2><span class="sp"></span><span class="help">Ø groß : klein = ${gw} : 1</span></div>
      ${!roster.length ? '<p class="help">Noch keine Namen – über „Klasse bearbeiten“ eintragen oder die Klassenliste einlesen.</p>'
        : `<div class="scroll-x"><table class="k-tab"><tr><th>Name</th>${cols.map(head).join('')}<th class="k-avg">Ø groß</th><th class="k-avg">Ø klein</th><th class="k-avg">Gesamt</th></tr>
        ${roster.map((r, i) => `<tr><td><b>${esc(r.n)}</b>, ${esc(r.v)}</td>${cols.map(e => `<td>${val(e, cell[i][e.id])}</td>`).join('')}<td class="k-avg">${fmt(avg(i, GROSS))}</td><td class="k-avg">${fmt(avg(i, KLEIN))}</td><td class="k-avg"><b>${fmt(total(i))}</b></td></tr>`).join('')}
        <tr class="k-foot"><td>Klassen-Ø</td>${cols.map(e => `<td>${e.notes ? fmt(mean(e.notes.rows.map(x => x.note).filter(x => x != null)), 1) : ''}</td>`).join('')}<td class="k-avg"></td><td class="k-avg"></td><td class="k-avg">${fmt(mean(roster.map((_, i) => total(i)).filter(x => x != null)))}</td></tr></table></div>
        <p class="help">${pkt ? 'Notenpunkte 0–15. ' : skalen.size > 1 ? '⚠ Noten und Notenpunkte gemischt – Durchschnitte nur bedingt sinnvoll. ' : ''}„–“ nicht teilgenommen · „·“ noch nicht ausgewertet · „?“ ausgewertet, aber die Noten fehlen noch: Auswertung einmal öffnen${pend.length ? ` (${pend.map(e => `<a href="#/p/${e.id}">${esc(KURZ[e.art] || e.art)} ${esc(short(e.datum))}</a>`).join(', ')})` : ''} · * noch nicht alles bewertet · Übungsprüfungen zählen nicht.</p>
        ${extra.length ? `<p class="help">⚠ Nicht in der Namensliste: ${extra.map(x => `${esc(x.row.v)} ${esc(x.row.n)} (${esc(KURZ[x.e.art] || x.e.art)} ${esc(short(x.e.datum))}: ${x.row.note})`).join(', ')} – Name in der Auswertung zuordnen oder in der Klasse ergänzen.</p>` : ''}`}
    </section>
    <h2>Prüfungen</h2>
    ${exams.length ? `<div class="tiles">${exams.slice().reverse().map(e => `<a class="tile" href="#/p/${e.id}"><span class="k">${esc(e.fach)} · ${esc(e.art)}</span><span class="t">${esc(e.titel || 'ohne Titel')}</span><span class="m">${esc(fmtDate(e.datum))}</span><span class="s">${H.statusChip(e)}</span></a>`).join('')}</div>` : '<p class="help">Noch keine Prüfung in dieser Klasse.</p>'}`;
  $('#kx').onclick = () => H.examForm(null, { ...c, roster });
  $('#ked').onclick = () => classForm(H, D);
  $('#kdel').onclick = async () => {
    if (!confirm(`Klasse ${c.name} löschen? Die Namensliste wird gelöscht. Prüfungen und Noten bleiben erhalten (unter „Meine Prüfungen“).`)) return;
    try { await api('cl_delete', { id: c.id }); toast('🗑 Klasse gelöscht'); location.hash = '#/'; } catch (er) { toast('⚠ ' + esc(er.message)); }
  };
}
