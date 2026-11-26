// Probe – Korrekturdialog für handschriftliche Aufgaben: Foto groß, grün anmerken (frei zeichnen oder stempeln),
// Punktespalte rechts, Punkte additiv oder subtraktiv aus den Stempeln, ‹ › zum vorherigen/nächsten Schüler (gleiche Aufgabe).
// Gespeichert in der (verschlüsselten) Bewertung: g.hk[pid][taskId] = Anmerkung, g.hkMode[taskId] = 'add' | 'sub',
// die Punkte wie sonst in g.manual[pid][taskId]. Nie an eine KI.
import { STAMPS, stampVal, annTotal, hasArrows, fmtV, stampSvg, stampIcon, unit, annSvgInner, solutionHtml, ensureCss, IMG_RE, GREEN, colHtml } from './handview.js';

let TOOL = 'stamp', STAMP = 'ok'; // bleibt beim Wechsel zum nächsten Schüler

/** ctx = { X, S2, results, saveGrading, onClose(pid) } */
export function openKorrektur(ctx, pid, tid) {
  ensureCss(); css();
  const { X, S2 } = ctx, { esc } = X, { key, g } = S2, i = key.tasks.findIndex(t => t.id === tid), t = key.tasks[i];
  const RS = ctx.results(), list = RS.filter(x => IMG_RE.test(x.R.items[i]?.img || '')), pos = list.findIndex(x => x.p.id === pid), x = list[pos];
  if (!x) { X.toast('Kein Foto bei diesem Schüler.'); return; }
  const it = x.R.items[i], img = it.img;
  g.hk = g.hk || {}; g.hkMode = g.hkMode || {};
  const mine = g.hk[pid] = g.hk[pid] || {};
  const ann = mine[tid] = mine[tid] || { w: 0, h: 0, s: [], st: [] };
  if (ann.man == null && !ann.st.length && !ann.s.length && g.manual[pid]?.[tid] != null) ann.man = g.manual[pid][tid]; // schon von Hand bewertet
  let mode = g.hkMode[tid] || 'add', erase = false, hist = [], sel = null;

  const ov = document.createElement('div'); ov.className = 'hkd'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Korrektur');
  ov.innerHTML = `<div class="hkd-top">
      <button class="btn" data-k="prev"${pos > 0 ? ` title="${esc(list[pos - 1].p.v)} ${esc(list[pos - 1].p.n)}"` : ' disabled'} aria-label="vorheriger Schüler">‹</button>
      <div class="hkd-who"><b>${esc(x.p.v)} ${esc(x.p.n)}</b><span>${i + 1}. ${esc(t.title)} · ${pos + 1} / ${list.length}</span></div>
      <button class="btn" data-k="next"${pos < list.length - 1 ? ` title="${esc(list[pos + 1].p.v)} ${esc(list[pos + 1].p.n)}"` : ' disabled'} aria-label="nächster Schüler">›</button>
      <button class="btn ghost" data-k="close" aria-label="Schließen">✕</button></div>
    <div class="hkd-bar">
      <div class="hkd-pts"><label>Punkte <input id="hkp" type="number" min="0" max="${t.pts}" step="0.5" inputmode="decimal"> / ${String(t.pts).replace('.', ',')}</label>
        <div class="seg" id="hkm"><button type="button" data-m="add">Additiv</button><button type="button" data-m="sub">Subtraktiv</button></div>
        <small id="hka"></small></div>
      <div class="hkd-tools"><div class="seg" id="hkt"><button type="button" data-t="pen">✎ Frei zeichnen</button><button type="button" data-t="stamp">Stempel</button></div>
        <div class="hkd-st" id="hks">${STAMPS.map(([k, n]) => `<button type="button" data-s="${k}" title="${n}" aria-label="${n}">${stampIcon(k)}</button>`).join('')}</div>
        <button type="button" class="btn sm" data-k="erase" aria-pressed="false">⌫ Radierer</button><button type="button" class="btn sm" data-k="undo">↶ Rückgängig</button></div></div>
    <div class="hkd-main"><div class="hkd-pic"><img src="${img}" alt="Lösung von ${esc(x.p.v)}" draggable="false"><svg id="hkv" aria-hidden="true"></svg><div class="hkd-arw" id="hkr"></div></div><div class="hkd-col" id="hkc"></div></div>
    ${t.rubric?.length || t.solution ? `<details class="hkd-info"><summary>Erwartungshorizont und Musterlösung</summary>${t.rubric?.length ? `<div class="help">${t.rubric.map(r => `${esc(r.t)} (${String(r.p).replace('.', ',')} P.)`).join(' · ')}</div>` : ''}${solutionHtml(t.solution)}</details>` : ''}`;
  document.body.append(ov); document.body.classList.add('hkd-open');
  const $ = s => ov.querySelector(s), svg = $('#hkv'), im = $('.hkd-pic img');

  const total = () => annTotal(ann, mode, t.pts);
  function commit() { // Punkte und Bewertung speichern
    const tot = total(), man = g.manual[pid] = g.manual[pid] || {};
    if (ann.man != null) man[tid] = ann.man; else if (tot != null) man[tid] = tot; else delete man[tid];
    if (!ann.s.length && !ann.st.length && ann.man == null) delete mine[tid];
    else mine[tid] = ann;
    ctx.saveGrading();
  }
  function draw() {
    const u = unit(ann);
    svg.setAttribute('viewBox', `0 0 ${ann.w} ${ann.h}`);
    svg.innerHTML = annSvgInner(ann) + (sel ? `<circle cx="${sel.x}" cy="${sel.y}" r="${u * 0.85}" fill="none" stroke="${GREEN}" stroke-width="${u * 0.04}" stroke-dasharray="${u * 0.15}"/>` : '');
    // ▲▼ neben jedem Stempel, der welche hat; Werte in der Punktespalte auf gleicher Höhe
    $('#hkr').innerHTML = (sel && ann.st.includes(sel) ? `<button type="button" class="hkd-del" data-del="${sel.id}" aria-label="Stempel löschen" title="Stempel löschen" style="left:${(100 * (sel.x - u * 0.85) / ann.w).toFixed(2)}%;top:${(100 * (sel.y - u * 0.85) / ann.h).toFixed(2)}%">×</button>` : '') + ann.st.filter(s => hasArrows(s.k, mode)).map(s => `<span class="hkd-ud" style="left:${(100 * (s.x + u * 0.75) / ann.w).toFixed(2)}%;top:${(100 * s.y / ann.h).toFixed(2)}%"><button type="button" data-up="${s.id}" aria-label="plus 0,5">▲</button><button type="button" data-dn="${s.id}" aria-label="minus 0,5">▼</button></span>`).join('');
    $('#hkc').outerHTML = colHtml(ann.st.map(s => ({ y: s.y, v: stampVal(s, mode) })).filter(x => x.v != null), ann.h, 'hkd-col', 50).replace('<div class="hkd-col"', '<div class="hkd-col" id="hkc"');
    const tot = total();
    $('#hkp').value = ann.man != null ? String(ann.man) : tot != null ? String(tot) : '';
    $('#hka').innerHTML = ann.man != null ? `von Hand${tot != null ? ` · aus den Stempeln wären es ${String(tot).replace('.', ',')} <button type="button" class="btn sm" data-k="auto">↺ übernehmen</button>` : ''}`
      : tot != null ? (() => { const sum = ann.st.reduce((a, q) => a + (stampVal(q, mode) || 0), 0), f = v => String(v).replace('.', ','); return mode === 'sub' ? `aus den Stempeln: ${f(t.pts)} ${sum < 0 ? '− ' + f(-sum) : sum > 0 ? '+ ' + f(sum) : '± 0'}` : 'Summe aus den Stempeln'; })() : 'noch nicht bewertet';
    ov.querySelectorAll('#hkm [data-m]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    ov.querySelectorAll('#hkt [data-t]').forEach(b => b.setAttribute('aria-pressed', String(!erase && b.dataset.t === TOOL)));
    ov.querySelectorAll('#hks [data-s]').forEach(b => b.setAttribute('aria-pressed', String(!erase && TOOL === 'stamp' && b.dataset.s === STAMP)));
    $('#hks').hidden = TOOL !== 'stamp' || erase; $('[data-k=erase]').setAttribute('aria-pressed', String(erase)); $('[data-k=undo]').disabled = !hist.length;
    // Foto so groß wie möglich, ohne dass etwas aus dem Bild ragt (Höhe bis zur Info-Leiste)
    const info = $('.hkd-info'), top = $('.hkd-main').getBoundingClientRect().top + ov.scrollTop;
    im.style.maxHeight = Math.max(240, window.innerHeight - top - (info ? info.offsetHeight + 12 : 0) - 16) + 'px';
    $('#hkc').style.height = im.clientHeight + 'px';
  }
  const snap = () => { hist.push(JSON.stringify({ s: ann.s, st: ann.st })); if (hist.length > 60) hist.shift(); };
  const pt = e => { const r = svg.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * ann.w), Math.round((e.clientY - r.top) / r.height * ann.h)]; };
  const hitStamp = (x0, y0) => { const u = unit(ann); let best = null, d0 = u * 0.9; for (const s of ann.st) { const d = Math.hypot(s.x - x0, s.y - y0); if (d < d0) { d0 = d; best = s; } } return best; };

  // Zeichnen, Stempeln, Verschieben, Radieren – Stift, Maus oder Finger
  svg.addEventListener('pointerdown', e => {
    if (!ann.w) return; e.preventDefault(); svg.setPointerCapture(e.pointerId);
    const [x0, y0] = pt(e);
    if (erase) {
      const s = hitStamp(x0, y0), r = unit(ann) * 0.6;
      const k = s ? -1 : ann.s.findIndex(p => { for (let j = 0; j < p.length; j += 2) if (Math.hypot(p[j] - x0, p[j + 1] - y0) < r) return true; return false; });
      if (s || k >= 0) { snap(); if (s) ann.st = ann.st.filter(q => q !== s); else ann.s.splice(k, 1); sel = null; draw(); commit(); }
      return;
    }
    if (TOOL === 'pen') {
      snap(); const line = [x0, y0]; ann.s.push(line); const lw = Math.max(2, ann.w * 0.0035);
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); Object.entries({ fill: 'none', stroke: GREEN, 'stroke-width': lw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', points: line.join(' ') }).forEach(([a, v]) => pl.setAttribute(a, v)); svg.append(pl);
      const mv = ev => { const [x, y] = pt(ev), lx = line[line.length - 2], ly = line[line.length - 1]; if (Math.hypot(x - lx, y - ly) >= ann.w * 0.0025) { line.push(x, y); pl.setAttribute('points', line.join(' ')); } };
      const up = () => { svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); if (line.length < 4) line.push(x0 + 1, y0); draw(); commit(); };
      svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
      return;
    }
    // Stempel: auf einen vorhandenen tippen = auswählen und verschieben, sonst neu setzen
    let s = hitStamp(x0, y0), moved = false; snap();
    if (!s) { s = { id: Math.random().toString(36).slice(2, 9), k: STAMP, x: x0, y: y0, adj: 0 }; ann.st.push(s); moved = true; }
    sel = s; draw();
    const dx = s.x - x0, dy = s.y - y0;
    const mv = ev => { const [x, y] = pt(ev); s.x = Math.max(0, Math.min(ann.w, x + dx)); s.y = Math.max(0, Math.min(ann.h, y + dy)); moved = true; draw(); };
    const up = () => { svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); if (!moved) hist.pop(); draw(); commit(); };
    svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  });
  const go = p => { close(false); openKorrektur(ctx, p, tid); };
  function close(final = true) { ov.remove(); document.body.classList.remove('hkd-open'); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', draw); if (final) ctx.onClose?.(pid); }
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey); window.addEventListener('resize', draw);
  ov.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'close') return close();
    if (k === 'prev' && pos > 0) return go(list[pos - 1].p.id);
    if (k === 'next' && pos < list.length - 1) return go(list[pos + 1].p.id);
    if (k === 'erase') { erase = !erase; sel = null; return draw(); }
    if (k === 'undo') { const h = hist.pop(); if (h) { const o = JSON.parse(h); ann.s = o.s; ann.st = o.st; sel = null; draw(); commit(); } return; }
    if (k === 'auto') { delete ann.man; draw(); commit(); return; }
    if (b.dataset.m) { mode = g.hkMode[tid] = b.dataset.m; draw(); commit(); return; } // gilt für diese Aufgabe bei allen Schülern
    if (b.dataset.t) { TOOL = b.dataset.t; erase = false; sel = null; return draw(); }
    if (b.dataset.s) { STAMP = b.dataset.s; TOOL = 'stamp'; erase = false; return draw(); }
    if (b.dataset.del) { const s = ann.st.find(q => q.id === b.dataset.del); if (s) { snap(); ann.st = ann.st.filter(q => q !== s); sel = null; draw(); commit(); } return; }
    const ud = b.dataset.up || b.dataset.dn;
    if (ud) { const s = ann.st.find(q => q.id === ud); if (!s) return; snap(); s.adj = Math.round(((s.adj || 0) + (b.dataset.up ? 0.5 : -0.5)) * 2) / 2; sel = s; draw(); commit(); }
  });
  $('#hkp').addEventListener('input', e => { const v = e.target.value.trim().replace(',', '.'); if (v === '') delete ann.man; else if (isFinite(+v)) ann.man = Math.max(0, Math.min(t.pts, Math.round(+v * 2) / 2)); commit(); const a = $('#hka'); a.textContent = ann.man != null ? 'von Hand' : ''; });
  $('#hkp').addEventListener('change', () => draw());
  const ready = () => { if (!ann.w) { ann.w = im.naturalWidth; ann.h = im.naturalHeight; } draw(); };
  if (im.complete && im.naturalWidth) ready(); else im.onload = ready;
}

let done = false;
function css() {
  if (done) return; done = true;
  const st = document.createElement('style');
  st.textContent = `
body.hkd-open{overflow:hidden}
.hkd{position:fixed;inset:0;z-index:1000;background:var(--bg,#f3f5fb);display:flex;flex-direction:column;padding:10px 14px 14px;gap:8px;overflow:auto}
.hkd-top{display:flex;align-items:center;gap:10px}.hkd-top .btn{min-width:44px;min-height:44px;font-size:20px}
.hkd-who{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center}.hkd-who b{font-size:18px}.hkd-who span{color:var(--ink-2);font-size:14px}
.hkd-bar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:flex-start;background:var(--surface,#fff);border:1px solid var(--line);border-radius:14px;padding:10px 12px}
.hkd-pts{display:flex;flex-direction:column;gap:6px}.hkd-pts label{font-weight:700;display:flex;align-items:center;gap:6px;margin:0}
.hkd-pts input{width:84px;font-size:20px;font-weight:800;text-align:center;padding:6px}.hkd-pts small{color:var(--ink-2);font-size:12px;max-width:260px}
.hkd-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.hkd .seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.hkd .seg button{border:0;background:var(--surface,#fff);padding:8px 12px;font:inherit;font-weight:600;cursor:pointer;color:var(--ink);min-height:40px}
.hkd .seg button[aria-pressed=true]{background:${GREEN};color:#fff}
.hkd-st{display:inline-flex;gap:4px}.hkd-st button{width:44px;height:44px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;display:grid;place-items:center}
.hkd-st button[aria-pressed=true]{outline:3px solid ${GREEN};outline-offset:-2px;background:color-mix(in srgb,${GREEN} 12%,#fff)}
.hkd [data-k=erase][aria-pressed=true]{background:#fde6e6;border-color:#d55}
.hkd-main{display:flex;align-items:flex-start;justify-content:center;flex:1;min-height:0}
.hkd-pic{position:relative;line-height:0;max-width:calc(100% - 76px)}
.hkd-pic img{display:block;max-width:100%;width:auto;height:auto;background:#fff;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.15);user-select:none;-webkit-user-select:none;pointer-events:none}
.hkd-pic svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
.hkd-arw{position:absolute;inset:0;pointer-events:none}
.hkd-ud{position:absolute;transform:translateY(-50%);display:flex;flex-direction:column;gap:2px;pointer-events:auto}
.hkd-ud button{width:30px;height:24px;border:1px solid ${GREEN};background:#fff;color:${GREEN};border-radius:6px;font-size:12px;line-height:1;cursor:pointer;padding:0}
.hkd-del{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:#d92d2d;color:#fff;font-size:17px;font-weight:800;line-height:1;padding:0;cursor:pointer;pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.hkd-del::after{content:'';position:absolute;inset:-9px}
.hkd-col{position:relative;min-width:64px;flex:none;margin-left:8px;border-left:2px dashed ${GREEN}66}
.hkd-col span{position:absolute;left:8px;transform:translateY(-50%);font-weight:800;font-size:18px;color:${GREEN};white-space:nowrap}
.hkd-info{background:var(--surface,#fff);border:1px solid var(--line);border-radius:12px;padding:8px 12px}`;
  document.head.append(st);
}
