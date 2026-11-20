// Probe – Namen der Anmeldungen der Klassenliste zuordnen.
// Schüler tippen ihren Namen selbst ein: Rufname statt aller Vornamen („Max“ statt „Maximilian Antony“),
// nur ein Teil eines Doppelnamens, Kurzformen („Basti“), Tippfehler, Vor- und Nachname vertauscht.

export const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const toks = s => norm(s).split(' ').filter(Boolean);
export function lev(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Kurz- und Rufformen, die kein Anfang des vollen Namens sind (normalisiert: ä → ae …)
const NICK = {
  basti: ['sebastian'], wastl: ['sebastian'], sepp: ['josef', 'joseph'], seppi: ['josef', 'joseph'], hannes: ['johannes'], hans: ['johannes'],
  hansi: ['johannes'], toni: ['anton', 'antonia', 'antonius'], tony: ['anton', 'antonia'], leni: ['helena', 'magdalena', 'eleonore'],
  lena: ['helena', 'magdalena'], lene: ['helene', 'magdalena'], lisa: ['elisabeth', 'lisa'], liesl: ['elisabeth'], sissi: ['elisabeth'], betti: ['elisabeth'],
  sophie: ['sofia', 'sophia', 'sofie'], sofie: ['sophie', 'sofia', 'sophia'], sofia: ['sophia', 'sophie'], nick: ['niklas', 'nikolas', 'nicolas', 'nikolaus', 'nicholas'],
  niko: ['nikolas', 'nicolas', 'nikolaus'], nico: ['nicolas', 'nikolas'], benni: ['benjamin', 'benedikt'], ben: ['benjamin', 'benedikt'],
  matze: ['matthias'], hias: ['matthias'], michi: ['michael', 'michaela'], steffi: ['stefanie', 'stephanie'], kathi: ['katharina', 'kathrin'],
  kati: ['katharina', 'kathrin'], resi: ['theresa', 'therese', 'theresia'], vroni: ['veronika'], vreni: ['veronika'], franzi: ['franziska'],
  fritz: ['friedrich'], willi: ['wilhelm'], gabi: ['gabriele'], conny: ['cornelia', 'konstantin'], jo: ['johanna', 'johannes', 'josephine'],
  hanna: ['johanna'], hanne: ['johanna'], lilly: ['lilian', 'liliana'], lili: ['lilian', 'liliana'], tim: ['timo', 'timon', 'timotheus'],
  andi: ['andreas'], ferdl: ['ferdinand'], xaver: ['franz'], vinz: ['vinzenz'], domi: ['dominik', 'dominic'], flo: ['florian'],
};
const nick = (a, b) => !!(NICK[a]?.includes(b) || NICK[b]?.includes(a));
/** Abweichung zweier Namensteile: 0 gleich, sonst Anzahl Tippfehler (kurze Namen: keiner), ∞ = passt nicht */
function tokCost(a, b, first) {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length), tol = n >= 8 ? 2 : n >= 4 ? 1 : 0;
  const d = tol ? lev(a, b) : 99;
  if (d <= tol) return d;
  if (first) {
    if (a.length >= 3 && (b.startsWith(a) || a.startsWith(b))) return 1;        // Max ↔ Maximilian
    if (nick(a, b)) return 1;                                                   // Basti ↔ Sebastian
    if (a.length === 1 && b[0] === a) return 1.5;                               // Initiale: „Max A.“
  } else if (a.length === 1 && b[0] === a) return 2;                           // „Moritz K.“
  return Infinity;
}
/** Eingetippte Teile (inp) gegen die der Liste (ref): jeder eingetippte Teil muss passen; weitere Teile der Liste
 *  (zweiter Vorname, zweiter Teil eines Doppelnamens) dürfen fehlen. */
function partCost(inp, ref, first) {
  if (!inp.length || !ref.length) return Infinity;
  let sum = 0;
  for (const a of inp) {
    let best = Infinity; for (const b of ref) best = Math.min(best, tokCost(a, b, first));
    if (best === Infinity) {
      // zusammengeschrieben oder anders getrennt: „Muellerluedenscheidt“, „Anna Lena“ ↔ „Annalena“
      const joined = lev(inp.join(''), ref.join('')); return joined <= (inp.join('').length >= 8 ? 2 : 1) ? joined : Infinity;
    }
    sum += best;
  }
  return sum + (inp.length < ref.length ? 0.25 : 0);
}
/** Wie gut passt die Anmeldung p ({v, n}) zum Listeneintrag r ({v, n})? 0 = genau gleich, ∞ = gar nicht */
export function nameCost(p, r) {
  const pv = toks(p.v), pn = toks(p.n), rv = toks(r.v), rn = toks(r.n);
  const full = [...pv, ...pn].join(' '), a = [...rv, ...rn].join(' '), b = [...rn, ...rv].join(' ');
  if (!full) return Infinity;
  if (full === a || full === b) return 0;
  let best = Infinity;
  const tryIt = (fv, fn, extra) => { const c = partCost(fn, rn, false) + partCost(fv, rv, true); if (c + extra < best) best = c + extra; };
  tryIt(pv, pn, 0);
  tryIt(pn, pv, 0.25);                                   // Vor- und Nachname vertauscht
  if (!pv.length || !pn.length) {                        // alles in einem Feld: letzter bzw. erster Teil als Nachname
    const all = pv.length ? pv : pn;
    for (let k = 1; k < all.length; k++) { tryIt(all.slice(0, k), all.slice(k), 0.25); tryIt(all.slice(k), all.slice(0, k), 0.5); }
  }
  // Tippfehler über die Grenze hinweg (alte Regel): ganzer Name mit höchstens 2 Abweichungen
  const d = Math.min(lev(full, a), lev(full, b)); if (d <= 2 && d < best) best = d;
  return best <= 4 ? best : Infinity;
}
/**
 * Jede Anmeldung höchstens einem Namen der Liste zuordnen (beste Treffer zuerst).
 * Ergebnis: byPerson: Map(id → { idx, exact }), missing: Listeneinträge ohne Anmeldung.
 * fixed: Map(id → idx | -1) – von der Lehrkraft festgelegt (-1 = gehört zu niemandem der Liste)
 */
export function matchRoster(roster, people, fixed = new Map()) {
  const used = new Set(), res = new Map(), cands = [];
  for (const [id, idx] of fixed) {
    if (!people.some(p => p.id === id)) continue;
    if (idx >= 0 && idx < roster.length && !used.has(idx)) { res.set(id, { idx, exact: true, manual: true }); used.add(idx); }
    else if (idx === -1) res.set(id, null);
  }
  people.forEach(p => { if (res.has(p.id)) return; roster.forEach((r, i) => { if (used.has(i)) return; const c = nameCost(p, r); if (c < Infinity) cands.push({ p, i, c }); }); });
  cands.sort((x, y) => x.c - y.c);
  for (const c of cands) if (!res.has(c.p.id) && !used.has(c.i)) { res.set(c.p.id, { idx: c.i, exact: c.c === 0 }); used.add(c.i); }
  for (const [id, v] of [...res]) if (v === null) res.delete(id);
  return { byPerson: res, missing: roster.filter((_, i) => !used.has(i)), used };
}
