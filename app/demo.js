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
      ] },
    ],
  };
}

/* So haben die 15 Schüler abgeschnitten: richtige Quizfragen (von 3), Lücken (von 4), Zuordnungen (von 3), Rechnung (ja/nein), Freitext-Punkte (von 4).
   Ergibt mit dem Abiturschlüssel die Noten 1 1 2 2 2 3 3 3 3 4 4 4 5 5 6 – Schnitt 3,2. */
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
  return a;
}

/** Beide Beispielprüfungen anlegen. force: auch wenn es sie schon einmal gab (Menü „Beispielprüfungen neu anlegen“). */
export async function seedDemos({ api, K, S }, force = false) {
  const pub = S.keys.pub_key, seal = d => K.seal(pub, d);
  const exams = [];
  const TASKS = new Set(['task', 'quiz', 'gap', 'match', 'essay', 'mark', 'sort', 'order', 'app']);
  for (const [klasse, done, make, titel, fach, art] of [['7d', true, magnetismus, DEMO_TITLE, 'Physik', 'Kurzarbeit'], ['7p', false, magnetismus, DEMO_TITLE, 'Physik', 'Kurzarbeit'],
    ['6a', false, englisch, ENGLISCH_TITLE, 'Englisch', 'AKL']]) {
    const doc = ensureKeys(make(klasse)), { student, key } = splitExam(doc);
    const T = doc.stations.flatMap(st => st.blocks).filter(b => TASKS.has(b.type));
    const x = {
      klasse, done, titel, fach, art, aufgaben: T.length, punkte: T.reduce((a, b) => a + Math.max(0, +(b.pts ?? 1) || 0), 0), dauer: 20,
      draft_enc: await seal(doc), key_enc: await seal(key), student_doc: JSON.stringify(student), roster_enc: await seal(KLASSE), roster_n: KLASSE.length, participants: [],
    };
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
  await api('exam_grading', { id: ids.id, grading_enc: await seal(g) });
  return true;
}
