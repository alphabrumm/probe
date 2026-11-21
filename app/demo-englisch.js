// Probe – Beispielprüfung Englisch (6. Klasse, AKL): Zeiten, Relativsätze, Question Tags – damit auch Sprachlehrkräfte
// gleich ein Beispiel aus ihrem Fach haben. Inhalt im PathFinder-Format (wie eine gesicherte .probe.json).
export const ENGLISCH_TITLE = 'Grammatik-Prüfung: Zeiten, Relativsätze, Question Tags';
const DOC = {
 "v": 2,
 "id": "demo-englisch",
 "form": "pruefung",
 "design": {
  "pal": 16,
  "font": "schlicht",
  "shape": "eckig",
  "hero": "bild",
  "heroImg": "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20120%2080%22%3E%0A%20%20%3Crect%20x%3D%225%22%20y%3D%225%22%20width%3D%22110%22%20height%3D%2255%22%20rx%3D%2210%22%20fill%3D%22%232b6777%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M%2030%2060%20L%2030%2075%20L%2045%2060%20Z%22%20fill%3D%22%232b6777%22%2F%3E%0A%20%20%3Ctext%20x%3D%2260%22%20y%3D%2240%22%20font-family%3D%22sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22bold%22%20fill%3D%22%23ffffff%22%20text-anchor%3D%22middle%22%3EEN%3C%2Ftext%3E%0A%3C%2Fsvg%3E",
  "theme": "standard"
 },
 "kicker": "Englisch · 6. Klasse",
 "title": "Grammatik-Prüfung: Zeiten, Relativsätze, Question Tags",
 "subtitle": "Englisch · Kleiner Leistungsnachweis",
 "goals": [
  "Present perfect simple und past progressive richtig erkennen und bilden",
  "Going to, will und das timetable-future richtig verwenden",
  "Relativsätze mit who, which und that verwenden",
  "Question tags bilden"
 ],
 "rank": "",
 "anim": {},
 "typeLines": [],
 "stations": [
  {
   "id": "fq3tfop",
   "title": "Teil A",
   "sub": "Grundwissen und Formen",
   "check": false,
   "blocks": [
    {
     "type": "text",
     "html": "Bearbeite die Aufgaben der Reihe nach. Deine Punkte zeigt dir die Plattform erst nach der Abgabe.",
     "id": "a46wp33",
     "anim": "einblenden"
    },
    {
     "type": "quiz",
     "qs": [
      {
       "q": "Which sentence is correct present perfect simple?",
       "opts": [
        {
         "t": "She have finished her homework.",
         "ok": false,
         "fb": "Das Hilfsverb passt zu &quot;she&quot; nicht: es muss &quot;has&quot; heißen",
         "k": "4s4bd25fze"
        },
        {
         "t": "She has finished her homework.",
         "ok": true,
         "fb": "",
         "k": "lassb98nls"
        },
        {
         "t": "She finished her homework yesterday.",
         "ok": false,
         "fb": "Mit &quot;yesterday&quot; benutzt man das simple past",
         "k": "e66hdj56ma"
        }
       ]
      },
      {
       "q": "Which signal words fit the past progressive?",
       "opts": [
        {
         "t": "already, just, yet",
         "ok": false,
         "fb": "",
         "k": "n2twywh959"
        },
        {
         "t": "while, at 6 pm yesterday, when",
         "ok": true,
         "fb": "",
         "k": "0o33xa0bta"
        },
        {
         "t": "tomorrow, next week",
         "ok": false,
         "fb": "",
         "k": "w07ja0tuib"
        }
       ]
      },
      {
       "q": "Which question tag fits? &quot;Your sister is in my class, ___?&quot;",
       "opts": [
        {
         "t": "isn't she",
         "ok": true,
         "fb": "",
         "k": "n4uern1k0l"
        },
        {
         "t": "is she",
         "ok": false,
         "fb": "",
         "k": "skcwjapt1z"
        },
        {
         "t": "doesn't she",
         "ok": false,
         "fb": "",
         "k": "rvels3ct2g"
        }
       ]
      }
     ],
     "xp": 3,
     "pts": 3,
     "id": "j5o17wp"
    },
    {
     "type": "match",
     "title": "Welches Signalwort passt zu welcher Zeitform?",
     "pairs": [
      {
       "a": "just / already / yet",
       "b": "present perfect simple",
       "ka": "o1ba1oxnad",
       "kb": "ftsq3yxl9q"
      },
      {
       "a": "while / at 4 pm yesterday",
       "b": "past progressive",
       "ka": "05nbbqn4mt",
       "kb": "if9sdhhsvw"
      },
      {
       "a": "tomorrow morning / soon",
       "b": "will-future",
       "ka": "4c9gnd7bam",
       "kb": "dp26nsylje"
      },
      {
       "a": "next Saturday / my plans",
       "b": "going to-future",
       "ka": "wvhuz4t9cd",
       "kb": "qm9phkmcjw"
      }
     ],
     "xp": 4,
     "pts": 4,
     "id": "6yamnvi"
    },
    {
     "type": "mark",
     "title": "Markiere alle Relativpronomen im Text.",
     "html": "My neighbour is the woman {{who}} helps old people. She has a dog {{which}} likes to bark. The house {{that}} she lives in is very old. It is near a park and people visit it in summer.",
     "xp": 2,
     "pts": 2,
     "id": "853idlb"
    },
    {
     "type": "gap",
     "title": "Setze die richtige Form ein (Achtung: Es gibt zu viele Wörter!)",
     "sub": "",
     "html": "Last Saturday I [[was waiting]] for the bus when it [[started]] to rain. I [[have never seen]] so much rain in my town! My friend Tom says: &quot;Next year we [[are going to]] visit Ireland.&quot; I think it [[will rain]] there too. You like rain, [[don't you]]?",
     "bank": true,
     "extra": [
      "has never saw",
      "rains",
      "are going"
     ],
     "heft": false,
     "xp": 6,
     "pts": 6,
     "id": "149uk7w"
    },
    {
     "type": "sort",
     "title": "Welche Aussage passt zu welcher Zeitform?",
     "groups": [
      {
       "name": "will-future",
       "items": [
        "I'll help you with your homework.",
        "Look at the clouds – it'll probably rain."
       ]
      },
      {
       "name": "going to-future",
       "items": [
        "We are going to bake a cake on Saturday.",
        "Look at the clouds – it's going to rain."
       ]
      },
      {
       "name": "timetable-future",
       "items": [
        "The film starts at 8 pm.",
        "The train to London leaves at 6.15 am."
       ]
      }
     ],
     "xp": 3,
     "pts": 3,
     "id": "230we6x"
    }
   ]
  },
  {
   "id": "gdsw1f8",
   "title": "Teil B",
   "sub": "Anwenden und Bewerten",
   "check": false,
   "blocks": [
    {
     "type": "text",
     "html": "Jetzt wendest du dein Wissen an: Sätze bauen, einen Dialog ordnen und Fehler bewerten.",
     "id": "q7v814z",
     "anim": "einblenden"
    },
    {
     "type": "order",
     "words": true,
     "title": "Bring die Wörter in die richtige Reihenfolge.",
     "items": [
      "we",
      "are going to",
      "visit our grandma",
      "at the weekend"
     ],
     "alts": [
      [
       "at the weekend",
       "we",
       "are going to",
       "visit our grandma"
      ]
     ],
     "xp": 4,
     "pts": 4,
     "id": "psncevo"
    },
    {
     "type": "order",
     "words": false,
     "title": "Bring den Dialog in die richtige Reihenfolge.",
     "items": [
      "Emma: You play tennis, don't you?",
      "Ben: Yes, I do. But it's raining at the moment, isn't it?",
      "Emma: Yes, it is. Look, it's stopping now!",
      "Ben: Great. Then I'll grab my racket and come over.",
      "Emma: Perfect. I have already booked a court for us, and we're going to play for two hours."
     ],
     "alts": [],
     "xp": 2,
     "pts": 2,
     "id": "o1rbkdr"
    },
    {
     "type": "essay",
     "title": "Fehler finden und begründen",
     "html": "<p>Deine Freundin Lily hat diese Sätze über ihr Wochenende geschrieben:</p><p><i>Last weekend I have visited my cousin. While we was playing football, the phone has rung.</i></p><p>Finde die Fehler. Schreibe die Sätze richtig auf und erkläre kurz, welche Zeitform steht und warum.</p>",
     "img": "",
     "lines": 8,
     "rubric": [
      {
       "t": "Fehler 1 erkannt und korrigiert: \"have visited\" ist falsch, weil \"last weekend\" eine abgeschlossene Zeit angibt -> \"I visited my cousin\"",
       "p": 1
      },
      {
       "t": "Fehler 2 erkannt und korrigiert: \"we was playing\" passt nicht zusammen, richtig ist \"we were playing\" (past progressive mit we)",
       "p": 1
      },
      {
       "t": "Fehler 3 erkannt und korrigiert: \"has rung\" ist falsch, richtig ist \"the phone rang\", weil die Handlung im simple past abgeschlossen ist",
       "p": 1
      },
      {
       "t": "Erklärung: Im while-Satz steht der längere Hintergrund im past progressive, das kurze Ereignis im simple past",
       "p": 1
      }
     ],
     "pts": 4,
     "id": "41285ok"
    }
   ]
  }
 ],
 "cert": {
  "on": false,
  "need": "immer",
  "pct": 80,
  "text": "hat den Lernpfad mit folgendem Ergebnis bearbeitet:",
  "show": {
   "zeit": true,
   "tipps": true,
   "quiz": true,
   "xp": true
  }
 },
 "pointsOn": true
};
export const englisch = klasse => { const d = JSON.parse(JSON.stringify(DOC)); d.id = 'demo-englisch-' + klasse; return d; };
