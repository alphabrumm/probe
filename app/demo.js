// Probe – Beispielprüfungen für jede Lehrkraft: Physik „7d“ schon geschrieben (liegt zur Korrektur bereit), Physik „7p“ und
// Englisch „6a“ (für Sprachlehrkräfte) fertig vorbereitet.
// Alles wird hier im Browser mit dem öffentlichen Schlüssel der Lehrkraft verschlüsselt – wie bei echten Prüfungen.
import { splitExam, ensureKeys, GRADE_KEY } from '../vendor/pathfinder/core/pfsplit.js';
import { englisch, ENGLISCH_TITLE } from './demo-englisch.js';

export const DEMO_TITLE = 'Demo Prüfung Magnetismus';
const KLASSE = [
  ['Anna', 'Alm'], ['Berti', 'Brehm'], ['Chiara', 'Christ'], ['Dennis', 'Dorn'], ['Emma', 'Eck'], ['Felix', 'Fink'], ['Greta', 'Graf'], ['Hannes', 'Hahn'],
  ['Ida', 'Imhof'], ['Jonas', 'Jung'], ['Klara', 'Kunz'], ['Lukas', 'Lang'], ['Mia', 'Moser'], ['Noah', 'Nagel'], ['Olivia', 'Ott'],
].map(([v, n]) => ({ v, n }));

/** kurze Prüfung Magnetismus (7. Klasse), 16 Punkte */
function magnetismus(klasse) {
  return {
    v: 2, id: 'demo-magnetismus-' + klasse, form: 'pruefung', design: { pal: 3, font: 'schlicht', shape: 'rund', hero: 'logo', heroImg: '' },
    kicker: `Physik · ${klasse} · Kurzarbeit`, title: DEMO_TITLE, subtitle: 'Bearbeitungszeit 20 Minuten · keine Hilfsmittel', goals: [], rank: '', anim: {}, typeLines: [], pointsOn: true,
    cert: { on: false, need: 'immer', pct: 80, text: '', show: { zeit: true, tipps: true, quiz: true, xp: true } },
    stations: [
      { id: 'sA', title: 'Grundwissen', sub: 'Teil A', check: false, blocks: [
        { id: 't0', type: 'text', html: 'Bearbeite alle Aufgaben. Deine Antworten werden automatisch gespeichert.' },
        { id: 'q1', type: 'quiz', pts: 3, qs: [
          { q: 'Welcher Stoff wird von einem Magneten angezogen?', opts: [{ t: 'Eisen', ok: true }, { t: 'Kupfer' }, { t: 'Aluminium' }, { t: 'Holz' }] },
          { q: 'Wo ist die Kraftwirkung eines Stabmagneten am größten?', opts: [{ t: 'an den Polen', ok: true }, { t: 'in der Mitte' }, { t: 'überall gleich' }] },
          { q: 'Was passiert, wenn man zwei Nordpole einander nähert?', opts: [{ t: 'Sie stoßen sich ab.', ok: true }, { t: 'Sie ziehen sich an.' }, { t: 'Es passiert nichts.' }] },
        ] },
        { id: 'g1', type: 'gap', pts: 4, title: 'Magnetpole', bank: true, extra: ['Pluspol'], heft: false, sub: '',
          html: 'Jeder Magnet hat einen [[Nordpol]] und einen [[Südpol]]. Gleichnamige Pole [[stoßen sich ab]], ungleichnamige Pole [[ziehen sich an]].' },
      ] },
      { id: 'sB', title: 'Anwenden', sub: 'Teil B', check: false, blocks: [
        { id: 'm1', type: 'match', pts: 3, title: 'Ordne richtig zu', pairs: [
          { a: 'Feldlinien', b: 'zeigen, wie das Magnetfeld verläuft' },
          { a: 'Kompassnadel', b: 'richtet sich im Magnetfeld der Erde aus' },
          { a: 'Eisenfeilspäne', b: 'machen das Magnetfeld sichtbar' },
        ] },
        { id: 'k1', type: 'task', pts: 2, title: 'Zerbrochener Magnet', html: 'Ein Stabmagnet zerbricht in der Mitte. Wie viele Magnetpole haben die beiden Bruchstücke zusammen?', answer: '4|vier', answerPh: 'Anzahl', solution: 'Jedes Bruchstück ist wieder ein vollständiger Magnet mit Nord- und Südpol: zusammen 4 Pole.', img: '' },
        { id: 'e1', type: 'essay', pts: 4, title: 'Eisennagel', html: 'Ein Eisennagel ist kein Magnet, wird aber von einem Magneten angezogen. Erkläre das mit dem Modell der Elementarmagnete.', lines: 5, img: '',
          rubric: [{ t: 'Im Eisen gibt es Elementarmagnete, die ungeordnet sind', p: 2 }, { t: 'Sie richten sich im Magnetfeld aus – der Nagel wird selbst zum Magneten', p: 2 }],
          solution: 'Im Eisen liegen viele winzige Elementarmagnete ungeordnet durcheinander, ihre Wirkungen heben sich auf. Kommt ein Magnet in die Nähe, richten sie sich aus; der Nagel wird selbst magnetisch und deshalb angezogen.' },
        { id: 'h1', type: 'essay', hand: true, pts: 3, title: 'Feldlinienbild', img: '',
          html: 'Zeichne auf Papier das Magnetfeld eines Stabmagneten mit mindestens sechs Feldlinien. Beschrifte die Pole und gib die Richtung der Feldlinien an. Fotografiere dann deine Zeichnung.',
          rubric: [{ t: 'Pole beschriftet', p: 1 }, { t: 'Feldlinien außen vom Nord- zum Südpol (Pfeile)', p: 1 }, { t: 'Feldlinien schneiden sich nicht, an den Polen dichter', p: 1 }],
          solution: 'Feldlinien verlaufen außerhalb des Magneten vom Nordpol (N) zum Südpol (S) und sind geschlossene Linien.\nSie schneiden sich nie; an den Polen liegen sie am dichtesten – dort ist die Kraft am größten: $F_\\text{Pol} > F_\\text{Mitte}$.' },
      ] },
    ],
  };
}

/* So haben die 15 Schüler abgeschnitten: richtige Quizfragen (von 3), Lücken (von 4), Zuordnungen (von 3), Rechnung (ja/nein), Freitext-Punkte (von 4).
   Dazu eine handschriftliche Aufgabe (3 P., ein Stellvertreter-Foto für alle): bei Ott und Brehm schon korrigiert, sonst noch offen. */
const LEISTUNG = {
  Alm: [3, 4, 3, 1, 3], Brehm: [2, 3, 1, 1, 1.5], Christ: [3, 4, 3, 1, 2], Dorn: [2, 2, 0, 0, 1], Eck: [3, 3, 2, 1, 2],
  Fink: [2, 2, 1, 0, 2], Graf: [3, 3, 1, 1, 1.5], Hahn: [1, 1, 0, 0, 0], Imhof: [3, 4, 2, 1, 1.5], Jung: [2, 3, 1, 0, 2],
  Kunz: [3, 3, 2, 1, 1.5], Lang: [1, 2, 1, 0, 0], Moser: [2, 3, 2, 0, 2], Nagel: [2, 2, 1, 0, 1.5], Ott: [3, 3, 1, 0, 3],
};
const ESSAY = {
  4: 'Im Eisen gibt es ganz viele kleine Elementarmagnete. Normalerweise liegen sie durcheinander und heben sich auf. Wenn ein Magnet kommt, drehen sie sich alle in die gleiche Richtung. Dann ist der Nagel selbst ein Magnet und wird angezogen.',
  3: 'Im Nagel sind Elementarmagnete. Der Magnet richtet sie aus, dann ist der Nagel auch magnetisch und wird angezogen.',
  2: 'Im Eisen sind kleine Elementarmagnete, die durcheinander liegen. Deshalb kann der Magnet den Nagel anziehen.',
  1.5: 'Weil Eisen Elementarmagnete hat und der Magnet die anzieht.',
  1: 'Eisen ist magnetisch, deshalb zieht der Magnet es an.',
  0: '',
};
const FEEDBACK = { Ott: { e1: 'Sehr gute Erklärung – genau so!' }, Brehm: { e1: 'Was passiert mit den Elementarmagneten, wenn der Magnet kommt?' }, Hahn: { e1: 'Hier fehlt leider eine Antwort.' } };

/** Antworten eines Schülers passend zu seiner Leistung (der Schlüssel kennt die richtigen Optionen) */
function answersFor(key, [q, g, m, k, e]) {
  const T = Object.fromEntries(key.tasks.map(t => [t.id, t])), a = {};
  a.q1 = {}; T.q1.qs.forEach((x, i) => { a.q1[i] = i < q ? x.ok[0] : x.opts.find(o => !o.ok).k; });
  const words = T.g1.gaps.map(x => x[0]), wrong = ['Südpol', 'Pluspol', 'ziehen sich an', 'stoßen sich ab'];
  a.g1 = {}; T.g1.gaps.forEach((x, i) => { a.g1[i] = i < g ? words[i] : wrong[i]; });
  const P = T.m1.pairs; a.m1 = {};
  if (m === 3) P.forEach(p => { a.m1[p.kb] = p.ka; });
  else if (m === 2) { a.m1[P[0].kb] = P[0].ka; a.m1[P[1].kb] = P[1].ka; }
  else if (m === 1) { a.m1[P[0].kb] = P[0].ka; a.m1[P[1].kb] = P[2].ka; a.m1[P[2].kb] = P[1].ka; }
  else { a.m1[P[0].kb] = P[1].ka; a.m1[P[1].kb] = P[2].ka; a.m1[P[2].kb] = P[0].ka; }
  a.k1 = k ? '4' : (e < 1.5 ? '2' : '1');
  if (ESSAY[e]) a.e1 = ESSAY[e];
  if (HAND && e > 0) a.h1 = { img: HAND, w: HAND_W, h: HAND_H, mode: 'bw', at: Date.now() }; // Stellvertreter-Foto für alle
  return a;
}

/** Beide Beispielprüfungen anlegen. force: auch wenn es sie schon einmal gab (Menü „Beispielprüfungen neu anlegen“). */
/** Stellvertreter-Foto für die handschriftliche Aufgabe (eine Zeichnung für alle Schüler, nur zum Ausprobieren) */
let HAND = ''; const HAND_W = 1000, HAND_H = 640;
async function loadHand() {
  if (HAND) return; try { const b = await (await fetch('app/demo-hand.png')).blob(); HAND = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); }); } catch (e) { HAND = ''; }
}

export async function seedDemos({ api, K, S }, force = false) {
  const pub = S.keys.pub_key, seal = d => K.seal(pub, d);
  await loadHand();
  const exams = [];
  const TASKS = new Set(['task', 'quiz', 'gap', 'match', 'essay', 'mark', 'sort', 'order', 'app']);
  for (const [klasse, done, make, titel, fach, art] of [['7d', true, magnetismus, DEMO_TITLE, 'Physik', 'Kurzarbeit'], ['7p', false, magnetismus, DEMO_TITLE, 'Physik', 'Kurzarbeit'],
    ['6a', false, englisch, ENGLISCH_TITLE, 'Englisch', 'AKL']]) {
    const doc = ensureKeys(make(klasse)), { student, key } = splitExam(doc);
    const T = doc.stations.flatMap(st => st.blocks).filter(b => TASKS.has(b.type));
    const x = {
      klasse, done, titel, fach, art, aufgaben: T.length, punkte: T.reduce((a, b) => a + Math.max(0, +(b.pts ?? 1) || 0), 0), dauer: 20,
      draft_enc: await seal(doc), key_enc: await seal(key), roster_enc: await seal(KLASSE), roster_n: KLASSE.length, participants: [],
    };
    if (!done) { const k = K.newExamKey(); Object.assign(x, { skey_enc: await seal({ k }), student_enc: await K.sealExamDoc(k, student) }); } // Schülerfassung nur verschlüsselt
    if (done) {
      let i = 0;
      for (const s of KLASSE) {
        const ans = answersFor(key, LEISTUNG[s.n]), rc = K.resultCode();
        x.participants.push({
          identity_enc: await seal({ v: s.v, n: s.n, rc }), answers_enc: await seal({ answers: ans, at: Date.now() }),
          minute: 9 + (i * 7) % 11, fokus: s.n === 'Hahn' ? 2 : s.n === 'Lang' ? 1 : 0,
        });
        x.participants[i]._n = s.n; i++;
      }
    }
    exams.push(x);
  }
  const send = exams.map(x => ({ ...x, participants: x.participants.map(({ _n, ...p }) => p) }));
  const r = await api('demo_seed', { exams: send, force: force ? 1 : 0 });
  if (r.skipped) return false;
  // Bewertung der Freitexte und ein paar Rückmeldungen – wie nach der Korrektur durch die Lehrkraft
  const done = exams.find(x => x.done), ids = r.exams.find(x => x.klasse === '7d');
  const g = { v: 1, gkey: GRADE_KEY.slice(), manual: {}, override: {}, feedback: {}, accept: {}, drop: [], days: 14 };
  done.participants.forEach((p, i) => { const pid = ids.pids[i]; g.manual[pid] = { e1: LEISTUNG[p._n][4] }; if (FEEDBACK[p._n]) g.feedback[pid] = FEEDBACK[p._n]; });
  // Handschrift: zwei Fotos schon korrigiert (subtraktiv), die übrigen warten auf die Korrektur
  if (HAND) {
    g.hkMode = { h1: 'sub' }; g.hk = {};
    done.participants.forEach((p, i) => {
      const pid = ids.pids[i], e = LEISTUNG[p._n][4];
      if (p._n === 'Ott') { g.hk[pid] = { h1: { w: HAND_W, h: HAND_H, s: [], tx: [], st: [{ id: 'o1', k: 'ok', x: 650, y: 315, adj: 0 }, { id: 'o2', k: 'ok', x: 870, y: 120, adj: 0 }, { id: 'o3', k: 'ok', x: 560, y: 600, adj: 0 }] } }; g.manual[pid].h1 = 3; }
      else if (p._n === 'Brehm') {
        g.hk[pid] = { h1: { w: HAND_W, h: HAND_H, s: [[180, 340, 260, 345, 340, 342]], st: [{ id: 'b1', k: 'ok', x: 650, y: 315, adj: 0 }, { id: 'b2', k: 'x', x: 140, y: 320, adj: 0 }],
          tx: [{ id: 'b3', x: 30, y: 380, t: 'Feldlinien schneiden\nsich nie!' }] } };
        g.manual[pid].h1 = 2;
      }
    });
  }
  await api('exam_grading', { id: ids.id, grading_enc: await seal(g) });
  try { await demoMarks({ api, K, S }, r.exams.find(x => x.klasse === '7p')?.id); } catch (er) { } // eigene Noten (mündlich, Referat …) in der Klasse 7p
  return true;
}

/** ein paar eigene Noten für die Beispielklasse (Abfragen, Referate, Beobachtungen) */
async function demoMarks(H, examId) {
  if (!examId) return;
  const { api } = H, { loadClass, saveMarks } = await import('./klassen.js');
  const e = (await api('exam_list')).exams.find(x => x.id === examId); if (!e?.class_id) return;
  const D = await loadClass(H, e.class_id); if (D.marks.e.length || !D.roster.length) return;
  const day = k => { const d = new Date(Date.now() - k * 86400e3); return d.toISOString().slice(0, 10); }, id = () => Math.random().toString(16).slice(2, 14);
  const A = [[0, 'Abfrage', 20, '2', '', 'k'], [3, 'Abfrage', 20, '3-', '', 'k'], [5, 'Abfrage', 13, '1', '', 'k'], [8, 'Abfrage', 13, '4+', '', 'k'], [1, 'Referat', 9, '2+', 'Kompass und Erdmagnetfeld', 'k'],
    [6, 'Referat', 9, '3', 'Elektromagnete im Alltag', 'k'], [2, 'Unterrichtsbeitrag', 6, '2', 'Versuch Magnetfeldlinien', 'k'], [10, 'Beobachtung', 2, '3', 'arbeitet im Versuch kaum mit', '0']];
  await saveMarks(H, D, L => { for (const [i, art, k, n, t, w] of A) if (D.roster[i]) L.push({ id: id(), sid: D.roster[i].sid, art, d: day(k), n, t, w }); });
}
