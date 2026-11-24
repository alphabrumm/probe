// Probe – Vorlagen für Umfragen (PathFinder-Textformat, Art „Befragung“). Beim Anlegen unter „Aus einer Vorlage“ wählbar;
// danach lässt sich jede Frage im Editor ändern.
export const VORLAGEN_U = [
  { title: 'Feedback zum Unterricht', sub: 'Verständlichkeit, Tempo, Klima – kurz, mit zwei offenen Fragen', text: `# Feedback zum Unterricht
Art: Befragung
Untertitel: Deine ehrliche Meinung hilft, den Unterricht zu verbessern. Die Umfrage ist anonym.

## Station: Wie läuft der Unterricht für dich?
### Skala: Wie gut kommst du im Moment im Unterricht mit?
Von: 1 = gar nicht
Bis: 10 = sehr gut

### Raster: Wie sehr stimmst du zu?
Spalten: trifft zu, trifft eher zu, trifft eher nicht zu, trifft nicht zu
- Die Erklärungen verstehe ich.
- Das Tempo passt für mich.
- Ich traue mich, Fragen zu stellen.
- Die Aufgaben sind abwechslungsreich.
- Ich weiß, was in der Prüfung verlangt wird.

### Auswahl: Die Hausaufgaben sind für mich …
- zu wenig
- genau richtig
- zu viel

## Station: Deine Ideen
### Offene Frage: Was soll so bleiben?
Zeilen: 3
Hinweis: freiwillig

### Offene Frage: Was sollte sich ändern?
Zeilen: 3
Hinweis: freiwillig
` },
  { title: 'Klassenklima', sub: 'Wohlfühlen, Miteinander, Wünsche der Klasse', text: `# Wie geht es uns als Klasse?
Art: Befragung
Untertitel: Die Umfrage ist anonym. Du musst nichts beantworten, was du nicht möchtest.

## Station: Ich in meiner Klasse
### Skala: Wie wohl fühlst du dich in deiner Klasse?
Von: 1 = gar nicht wohl
Bis: 10 = sehr wohl

### Raster: Wie sehr stimmst du zu?
Spalten: trifft zu, trifft eher zu, trifft eher nicht zu, trifft nicht zu
- Ich habe in der Klasse Menschen, mit denen ich mich gut verstehe.
- Wir gehen respektvoll miteinander um.
- Bei Streit finden wir meistens eine Lösung.
- Im Unterricht ist es ruhig genug, um gut zu arbeiten.
- Neue oder stille Mitschüler:innen werden einbezogen.

## Station: Was uns guttun würde
### Mehrfachauswahl: Was würde unserer Klasse guttun?
- ein gemeinsamer Ausflug
- mehr Gruppenarbeit
- ein Klassenrat
- eine neue Sitzordnung
- feste Regeln, an die sich alle halten

### Offene Frage: Das möchte ich noch sagen
Zeilen: 3
Hinweis: freiwillig
` },
  { title: 'Stimmungsbarometer', sub: 'drei schnelle Fragen, z. B. am Ende einer Woche', text: `# Stimmungsbarometer
Art: Befragung
Untertitel: Drei kurze Fragen – anonym.

## Station: Diese Woche
### Skala: Wie geht es dir gerade?
Von: 1 = schlecht
Bis: 5 = sehr gut

### Auswahl: Die Arbeitsbelastung ist im Moment …
- zu niedrig
- genau richtig
- hoch, aber machbar
- zu hoch

### Offene Frage: Ein Satz zur Woche
Zeilen: 1
Hinweis: freiwillig
` },
];
