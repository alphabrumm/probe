# Probe – digitale Prüfungen

Probe ist eine leichtgewichtige Prüfungsplattform für das iPad im Klassenzimmer. Prüfungen entstehen mit
[PathFinder](https://github.com/alphabrumm/pathfinder) (als Untermodul in `vendor/pathfinder` eingebunden), Schüler brauchen
kein Konto. Läuft auf normalem Webspace mit PHP und SQLite.

> Der Name: Eine *probe* ist eine Raumsonde – und in Bayern heißt der Leistungsnachweis „Probe“.

## Stand: Phase 1–5

* **Einrichtung:** Beim allerersten Aufruf legst du das Admin-Konto an.
* **Admin:** Lehrkräfte (Nutzername = Login, Startpasswort, Admin, Fachleitung), Fachschaften mit ihren Fächern, Fächerliste
  (vorbelegt nach LehrplanPLUS Gymnasium Bayern), Schuljahresende „Prüfungen löschen“, Sicherheitscheck.
* **Lehrkraft:** erstes Anmelden mit Startpasswort → eigenes Passwort und Wiederherstellungscode. Übersicht
  Schuljahr → Klassen → Prüfungen. Neue Prüfung mit Klasse, Fach, Datum, Art (Schulaufgabe, Kurzarbeit, AKL, Übungsprüfung),
  Bearbeitungszeit, Teilnehmerzahl, Einlass-PIN, Notenskala. Inhalt mit dem eingebetteten PathFinder (mit KI, leer oder als
  fertige Prüfung laden – Text einer externen KI oder gesicherte `.probe.json`; „Diese Prüfung sichern“ im „…“-Menü). Klassenliste als CSV oder zum Einfügen.
* **Durchführung:** QR-Code und PIN (auch für den Beamer), Live-Liste mit Klassenliste, Zeit für alle oder einzelne verlängern,
  automatische Abgabe abschaltbar, Schließen/Beenden, Notfall-Abgabe per Datei.
* **Auswertung:** Notenschlüssel per Regler, Freitext bewerten, Antworten akzeptieren, Aufgaben streichen, Ergebnisseiten
  mit Ergebniscode veröffentlichen, Kommentare der Schüler.
  * **⇩ Prüfung laden:** Dialog „nur die Prüfungsvorlage, keine Schülerergebnisse“, dann die Prüfung mit Lösungen als .json (wie „Prüfungsdatei für Probe“ in PathFinder) – z. B. als
    Nachschrift über „Prüfungsdatei laden“ in einer neuen Prüfung.
  * **Prüfungsprotokoll (PDF):** Übersicht, dann die **Prüfung mit Musterlösung** (Text, Bilder als JPEG, Lösungen grün), dann je Prüfling
    eine Seite. Bilder bettet `pdf.js` ein (`toJpeg`, `image()`); das Protokoll entsteht deshalb asynchron.
  * **„👁 Prüfung ansehen“ auf der Ergebnisseite:** Beim Veröffentlichen wird die Prüfung (mit Musterlösung) einmal mit einem zufälligen
    Schlüssel verschlüsselt (`exams.pubdoc_enc`, DB v20); der Schlüssel steht in jedem Ergebnisbericht (`dk`). Die Schüler öffnen sie
    schreibgeschützt in PathFinder: „Mit Lösungen“ und Vorschau zum selbst Ausprobieren, ohne Export, Dokumente oder KI. `r_doc` liefert
    sie nur zu einem gültigen Ergebniscode; beim Zurückziehen der Veröffentlichung bzw. nach Ablauf wird sie gelöscht.
* **Archivierung** (`app/archiv.js`, `app/zip.js`, DB v21):
  * **📦 Archivieren** (Auswertung) bzw. **📦 Schuljahr archivieren** (Übersicht): Archiv-Datei je Prüfung (`<Klasse>_<Fach>_<Art>_<Datum>_<Login>.probe-archiv.json`,
    mehrere als ZIP) mit Aufgaben, Lösungsschlüssel, Klassenliste, Abgaben (Namen, Antworten, Fotos), Bewertung und Kommentaren – verschlüsselt für die
    Lehrkraft und den Schul-Wiederherstellungsschlüssel (Hinweis vor jedem Export). Eine Kopie geht verschlüsselt an den Server (`exams.archive_enc`).
  * **Punkte:** grün = archiviert und die Bewertung seither unverändert (Prüfsumme `grading_hash` = `archived_hash`), rot = noch nicht bzw. seither
    geändert. **Brille:** grau = in Respizienz, orange = Rückfrage, grün = respiziert.
  * **📂 Prüfung einlesen:** Archiv (.json oder .zip, auch das Jahresarchiv) öffnen – mit eigenem Schlüssel oder der Schul-Passphrase – und Prüfungen
    als neue, beendete Prüfungen mit Abgaben und Noten anlegen (`exam_restore`; Teilnehmer-Nummern in der Bewertung werden umgeschrieben).
  * **Admin → Schuljahresende → Jahresarchiv:** ZIP aller beendeten Prüfungen eines Schuljahres, Ordner je Fachschaft („ohne Fachschaft“). Archivierte
    Prüfungen kommen als Archiv-Kopie (Lehrkraft + Schul-Passphrase), nicht archivierte als `…_NICHT-ARCHIVIERT.probe-roh.json` (nur für die Lehrkraft
    lesbar, ebenfalls einlesbar). Der Admin sieht nur die Dateinamen.
  * **Respizienz → 📊 Statistik** (Fachleitung): „Prüfungen der Fachschaft“ – alle veröffentlichten Prüfungen des Schuljahres nach Lehrkraft (Klasse, Fach,
    Art, Datum) mit rotem/grünem Punkt, ohne Inhalte und Ergebnisse (`fl_stats` liest nur Rahmendaten).
* **KI-gestützte Korrektur** (`app/ki.js`): ein Knopf „KI-Korrektur“ öffnet einen Assistenten in drei Schritten –
  1. Aufgaben wählen (empfohlen: wo getippt oder geschrieben wird; reine Auswahlaufgaben ausgegraut; gemerkt in `g.kiSel`) und
  Export erstellen, 2. Datei laden oder Text kopieren und in einer KI (z. B. ByLKI, Claude) abschicken, 3. Antwort der KI
  einfügen (auch viele einzelne JSON-Schnipsel; direkt erreichbar, wenn man später mit der Antwort zurückkommt). Der Export
  enthält nur die gewählten Aufgaben im PathFinder-Textformat (mit Lösungen, Erwartungshorizont und Material davor), eine
  Anleitung für die KI und die Antworten aller Schüler – ohne Namen, je Schüler eine Korrektur-Kennung `S-XXXXXX` (aus dem
  Ergebniscode abgeleitet, nicht umkehrbar). Vorschläge liegen in der verschlüsselten Bewertung (`g.ki`), pink mit KI-Sternen
  je Aufgabe; übernehmen oder ablehnen.
* **Bewerten je Schüler:** ‹ Vorheriger / Nächster › im Dialogkopf (speichert beim Wechseln); Schalter „Nur offene
  KI-Vorschläge“ (nur wenn KI-Vorschläge eingelesen sind, standardmäßig an); Code-Antworten mit Syntax-Highlighting
  (`app/hl.js`: Java für JPad, SQL für QPad) und Programmlauf als eigener Kasten; neben der Note ▲/▼, wenn ein halber Punkt
  die Note ändern würde (nur Ansicht, nicht in CSV, Protokoll oder Ergebnisseite).
* **Persönliche QR-Codes** (`app/pqr.js`, Spalte `exams.pqr`): Schalter in „Durchführung“ (braucht die Klassenliste).
  „QR-Codes generieren“ ergänzt je Schüler:in einen zufälligen Schlüssel und den Zugangscode zur Auswertung (verschlüsselt in
  der Klassenliste) und vergibt den Prüfungscode schon vor dem Start; das PDF hat je Schüler:in ein A4-Blatt mit Name, Prüfung,
  Datum, Zugangscode, QR-Code und Karopapier (5 mm) als Schmierblatt. Der QR-Code enthält `s.html?c=<Code>#p=…` – der Teil
  nach `#` (Name, Schlüssel, Zugangscode) geht nie an den Server. Anmeldung dann ohne Namenseingabe (PIN bleibt), Zuordnung
  über den Schlüssel; nach dem Start zeigt die Live-Ansicht statt des QR-Codes „Scanne jetzt deinen persönlichen QR-Code“
  (gemeinsamer QR-Code auf Wunsch für vergessene Blätter). Vor dem Start gescannt: Name und „nicht geöffnet“, später nur neu laden.
* **Namen:** Anmeldungen werden der Klassenliste zugeordnet (`app/names.js`) – auch mit Rufnamen („Max“ für „Maximilian Antony“),
  einem Teil eines Doppelnamens, Kurzformen („Basti“), Tippfehlern oder vertauschtem Vor- und Nachnamen. In der Auswertung
  steht der Name aus der Klassenliste (auch in Notenliste, Protokoll, Ergebnisseite); die Lehrkraft kann von Hand zuordnen und
  doppelte Anmeldungen zusammenführen (fehlende Antworten kommen aus der zweiten Anmeldung). Das steht nur in der verschlüsselten
  Bewertung und lässt sich jederzeit wieder trennen; die Abgaben selbst bleiben unverändert.
* **Respizienz:** Die Lehrkraft reicht die korrigierte Prüfung bei der Fachleitung ihrer Fachschaft ein (nur wenn es dort eine
  Fachleitung mit eingerichtetem Konto gibt). Das Paket – Prüfung mit Lösungen, Antworten, Bewertung, Klarnamen – wird für jede
  Fachleitung einzeln verschlüsselt. Die Fachleitung sieht unter „Respizienz“ Verteilung, Notenschlüssel, Ergebnisse und jede
  Antwort, kann die Prüfung ansehen, drucken, als Prüfungsprotokoll (PDF) ausgeben und **Notizen** ergänzen (intern oder für die
  Lehrkraft, je Empfänger verschlüsselt). Ablauf: eingereicht → *Rückfrage an die Lehrkraft* ⇄ erneut eingereicht → *abgezeichnet*.
  Auf den Kacheln der Lehrkraft steht „In Respizienz“, „Rückfrage der Fachleitung“ oder „✓ respiziert“.
* **Respizienz-Archiv:** Die Fachleitung exportiert eingereichte Prüfungen (Schuljahr, optional nur abgezeichnete) als Datei.
  Inhalt AES-256-GCM mit zufälligem Archivschlüssel; diesen gibt es verschlüsselt für die Fachleitung, für jeden Admin
  (Rückfallweg) und optional mit einer Archiv-Passphrase (z. B. für die Nachfolge). „📂 Archiv öffnen“ (Respizienz bzw.
  Admin → Schuljahresende) entschlüsselt nur im Browser – das Archiv wird nicht auf den Server geladen.
* **Löschen:** 🗑 auf der Kachel in der Übersicht, mit doppelter Nachfrage. Löscht die Prüfung endgültig vom Server (Inhalt, Lösungen,
  Klassenliste, Abgaben, Bewertung, Ergebnisseiten, Kommentare; SQLite `secure_delete`). Laufende Prüfungen erst beenden.
  Eine bei der Fachleitung eingereichte Fassung (Respizienz) bleibt dort erhalten.
* **Beispielprüfungen** für jede Lehrkraft (`app/demo.js`: Physik 7d geschrieben, Physik 7p und Englisch 6a vorbereitet – `app/demo-englisch.js`)
  und ein **Demo-Modus** ohne Konto (nach 4 Stunden gelöscht).

## Coaching (Prototyp)

Lerncoaching der Klassleitung (`app/coaching.js`, `app/cvorlagen.js`, Schülerseite `c.html` + `app/cstudent.js`, DB v10):

* **Anlegen:** Klasse, Titel, Selbstreflexion (kompakt oder mit Fähigkeiten-Raster) und Gesprächsbogen (Fokus, flexibel, offen/Oberstufe)
  nach den Herrschinger Arbeitsentwürfen; Klassenliste verschlüsselt. Je Schüler:in ein persönlicher QR-Code (A4-PDF).
* **Fragebogen:** `c.html?c=<Code>#p=…` – Name und Schlüssel nur im Link-Teil nach `#` (geht nie an den Server). Das iPad verschlüsselt
  Name und Antworten für die Klassleitung; der Server prüft nur einen nicht umkehrbaren Prüfwert (SHA-256) des persönlichen Schlüssels.
* **Dashboard:** Stand je Kind (Fragebogen, Gespräch, Wiedervorlage, Einwilligung), Klassenstatistik der Ankreuzfragen.
* **Coachinggespräch:** links Gesprächsbogen (speichert automatisch, verschlüsselt), rechts die Selbstreflexion.
* **Drucken** für den Schul-Safe (A4 im Layout der Vorlagen, mit Unterschriftsfeldern für die Einwilligung).
* **Export** (Datei mit Passphrase und eigenem Schlüssel), **Übergabe** an die nächste Klassleitung: nur bei „Ja“ und nur die
  Weitergabe-Felder (Ziele, Hilfen, Vereinbarung, Ergebnis) – für deren Probe-Konto oder mit Passphrase verschlüsselt.
* **Schulberatung** (Rolle im Admin): bekommt nur Zahlen (Häufigkeiten 1–2 als „1–2“, Mittelwerte ab 3 Antworten), für sie
  verschlüsselt; Ansicht nach Jahrgangsstufen.
* **Aufbewahrung:** Probe löscht nie selbst. Ab dem 15. Juli nach Schuljahresende erinnert es bei jeder Anmeldung an Export oder
  Löschen. Admin → Schuljahresende: Coaching-Daten aller Lehrkräfte löschen (dreimal nachfragen); lesen kann der Admin sie nicht.
* KI-Funktionen haben keinen Zugriff auf Coaching-Daten. „Beispiel anlegen“ erzeugt eine erfundene Klasse zum Ausprobieren.

**Vorlagen der Schule:** Die Schulberatung gestaltet Selbstreflexion und Gesprächsbogen im Reiter *Schulberatung* in
PathFinder (neu, als Text oder ausgehend von einer eingebauten Vorlage) und gibt sie frei; Klassleitungen wählen sie beim Anlegen.
Ein Coaching speichert eine Kopie der Vorlage (`coachings.rspec/gspec`) – spätere Änderungen betreffen nur neue Coachings.
Vorlagen enthalten nur Fragen (Klartext, Tabelle `ctemplates`); Hinweistexte werden vor dem Anzeigen bereinigt. Skala, Auswahl
und Raster gehen in die Statistik ein, Fragen mit „Weitergabe“ in die Übergabe, die Einwilligung bleibt `weitergabe`.

## Datenbank-Sicherungen

`db_snapshot()` (`intern/db.php`) legt mit `VACUUM INTO` eine in sich stimmige Kopie unter `data/sicherungen/` ab
(gesperrt wie `data/`): automatisch, bevor ein Update die Datenbank umbaut (`DB_VERSION`; die Migration selbst läuft dann in
einer Transaktion), und von Hand unter Admin → „Sicherungen“. Es bleiben die letzten 10. Download nur für Admins, jeder
Download steht im Protokoll (`sicherungen/protokoll.log`). Wiederherstellen: Datei per FTP als `data/probe.sqlite`
zurückspielen (vorher `probe.sqlite-wal` und `-shm` entfernen).

## Handschriftliche Aufgaben

Baustein „Handschriftliche Aufgabe“ (PathFinder, `### Handschrift` mit `Erwartung:` und `Lösung:`): Die Schüler fotografieren ihre
Lösung, das iPad macht daraus ein zugeschnittenes Schwarz-Weiß-Bild (`core/pfscan.js`). Die Musterlösung (Text/LaTeX,
`core/pfmath.js`) steht nie in der Schülerfassung; sie sehen Lehrkraft, Respizienz und nach dem Veröffentlichen die Ergebnisseite.
Korrektur (`app/handkorr.js`): Foto antippen → groß, grün frei zeichnen oder stempeln (✓ ✗ unterringelt, fehlt, Konsequenzfehler – ohne Abzug, A, R, S, G) und Textfelder,
Punktespalte rechts, additiv oder subtraktiv (je Aufgabe), ‹ › zum vorherigen/nächsten Schüler. Gespeichert verschlüsselt in der
Bewertung (`g.hk`, `g.hkMode`); Anzeige mit `app/handview.js`. Nie an eine KI, Punkte nur von Hand bzw. aus den Stempeln.

## Farbschemata

Konto-Menü → „Farbe“: Blau (Standard), Nachtblau, Weiß, Nachtblau und Gold, Gelb, Sepia und Bunt (das bunte `app/icon.svg`); die Schemata (`app/themes/<name>.css` setzen nur Farb-Variablen, auch für Kopfleiste
und Dunkelmodus; `<name>.svg` ist das passende Symbol in Menüband, Anmeldung und Tab). Gespeichert am Konto
(`prefs.theme`); `app/theme-boot.js` merkt sich nur den Namen auf dem Gerät, damit beim Laden nichts aufflackert.

## Modul Unterricht (Variante Lernpfad/Challenge)

`app/unterricht.js` (Lehrkraft), `l.html` + `app/unterricht-s.js` (Schüler), DB v22 (`lpaths`, `ucouplings`, `units`, `uprogress`,
`classes.ukey_enc`), Aktionen `lp_*` und `ut_*`. Im Konto-Menü unter „Module“ einschalten.

* **Meine Lernpfade:** im PathFinder-Editor (Formen Lernpfad und Challenge) erstellen oder einen aus PathFinder exportierten Lernpfad einlesen (HTML-Datei, auch Originaldesign, SCORM-/ZIP-Paket oder .json – übernommen wird nur das eingebettete Dokument `pf-doc`, nicht der Player); Fach, Jahrgangsstufe und Lernbereich aus der PathFinder-Einordnung (⚙ Allgemein) stehen auf der Kachel und dienen als Filter (`lpaths.meta`, Klartext, ohne Inhalt). Beim Starten stehen passende Lernpfade (gleiches Fach, Jahrgangsstufe aus dem Klassennamen) oben;
  verschlüsselt für die Lehrkraft gespeichert, auf allen Geräten gleich.
* **Klasse** (dieselbe wie bei Prüfungen) trägt die **QR-Kopplung**: je Schüler ein Einmal-QR-Code
  `l.html#u=<Klasse>.<Geheimnis>.<Klassenschlüssel>.<Name>` (der Teil hinter „#“ geht nie an den Server; der Server speichert nur den
  Hash des Geheimnisses). Beim Scannen bekommt das Gerät einen Geräteschlüssel (IndexedDB); der Code ist danach verbraucht. Neuer
  QR-Code je Person (z. B. zweites Gerät), „Abmelden“ sperrt alle Geräte der Person. Der Server kennt nur die Kennung (sid), keine Namen.
* **JPad-Lernumgebung bauen:** „＋ Neuer Lernpfad“ → „Mit KI erstellen“, Art Lernpfad, Fach Informatik → im Schritt „Aufgaben“
  „Als Java-Projekt realisieren“ (SQL- und Tabellen-Projekt stehen schon da, haben aber noch keine Funktion).
  JPad öffnet sich im Modus `?pfapp=autor`: links Startcode, rechts der Lernpfad-Editor von JPad (PathFinder mit Programmier-Aufgaben).
  Code, Lernpfad (als HTML wie in JPad-Projektdateien) und Titel werden laufend verschlüsselt als Material „JPad“ gespeichert;
  „✎ Bearbeiten“ öffnet es wieder dort. Leere Entwürfe aus dem Startdialog werden nicht mehr gespeichert.
* **JPad-Projekte** (☕ JPad-Projekt bzw. JPad-Projektdatei über „Datei einlesen“): Material mit JCode (JPad lädt Startcode und
  Lernpfad selbst), Projektdatei oder leerem Projekt. Auf dem Schüler-Gerät läuft JPad im Lernmodus (`?pfapp=unterricht`, Adresse aus
  config `apps_unterricht`, Standard jpad.pandapy.de; Test-Deploy: GitHub Pages) im Vollbild-Fenster von PathFinder (`core/pfapp.js`).
  Der eigene Stand liegt im Gerät (IndexedDB, Store `u`) und geht bei Änderungen verschlüsselt an die Lehrkraft (Dateien, letzter Lauf).
  Dashboard: Code-Umfang und letzter Lauf je Person, **👁 Ansehen** = Live-Ansicht (JPad schreibgeschützt, neuer Stand alle 3 s);
  das Gerät zeigt dann „Deine Lehrkraft schaut gerade zu“ und sendet schneller (`ut_watch`, Datenbank v25).
  In der Live-Ansicht: **✎ Bearbeiten** sperrt den Editor auf dem iPad; erst wenn das Gerät seinen letzten Stand geschickt und die Sperre
  bestätigt hat (`ack` zur Version `v`), wird der Code für die Lehrkraft frei. Ihre Änderungen sieht der Schüler live; **↩ Zurückgeben**
  übergibt ihren Stand, **✕ Verwerfen** gibt ohne Änderung frei (Schließen gibt automatisch zurück). **💬 Kommentar** zur Cursorzeile:
  blinkender grüner Kreis in der Haltepunkt-Spalte und Eintrag unter „Achtung“ (Zeilentext zum Wiederfinden). Inhalte mit dem
  Klassenschlüssel verschlüsselt (`uedit`, `ut_edit`, Datenbank v26).
* **Tafel-QR-Code** (Knopf in der Klasse, mit „Was ist das?“): gemeinsamer Code `l.html#t=<Klasse>.<Geheimnis>.<Klassenschlüssel>`
  plus 4-stellige PIN im Vollbild für Beamer/Tafel, 15 Minuten gültig (Server kennt Geheimnis und PIN nur als Hash; nach 25 falschen PINs
  verfällt der Code). Schüler ohne persönlichen Code tragen PIN, Vor- und Nachnamen ein und sind sofort gekoppelt (sid `T…`); der Name geht
  nur für die Lehrkraft verschlüsselt an den Server (`ucouplings.name_enc`). Genaue Namenstreffer ordnet Probe beim Öffnen der Klasse selbst
  zu, sonst „⇄ Namen zuordnen“ (Vorschläge wie bei Prüfungen, `names.js`) oder „in die Namensliste aufnehmen“; Kopplungen, Bearbeitungsstände
  und Empfängerlisten wandern mit (`ut_merge`). Datenbank v24.
* **Unterrichtseinheit:** „＋ Lernpfad starten“ (ganze Klasse oder Auswahl) – der Lernpfad wird mit dem Klassenschlüssel verschlüsselt
  und erscheint auf den gekoppelten Geräten (Abfrage alle 10 s). Er läuft über mehrere Stunden, bis die Lehrkraft „Beenden“ tippt
  (wieder öffnen möglich). Schüler senden ihren Stand nur bei Änderungen (gebündelt, für die Lehrkraft verschlüsselt) plus
  Lebenszeichen alle 45 s; „Abgeben“ markiert die Abgabe. PathFinder meldet den Stand über `host.onProgress` (Kurzfassung je Station).
* **Dashboard:** laufende Einheiten live (alle 7 s; zuletzt aktiv, Fortschritt, Stationen, Tipps, Zeit, Abgabe), beendete Einheiten
  (die letzten 3 als Kacheln, ältere eingeklappt), **Bearbeitungsstatistik** (Schüler × Einheiten, keine Note), Kopplung.

## Module

Die Einträge im oberen Menü sind **Module**: PathFinder, Prüfungen, Notizen, Umfragen und Coaching. Jede Lehrkraft schaltet
sie im Konto-Menü (Kürzel ▾ oben rechts) unter „Module“ ein oder aus (`users.prefs`, Aktion `set_prefs`). Ohne eigene Wahl
sind Prüfungen und Coaching an, der Rest aus (`PREFS_ON`). Ausschalten blendet nur aus – Daten bleiben. Ist „Prüfungen“ aus,
startet Probe im ersten eingeschalteten Modul. **Respizienz** (Fachleitung) und **Schulberatung** gehören zur Rolle und sind
nicht abwählbar. Die PlanPad-Kopplung steht darunter unter „Kopplung“; eine schon verbundene Klasse zeigt PlanPad weiter an.
Geplant: Module, die der Admin Fächern (oder allen Fächern) und einzelnen Lehrkräften freigibt, z. B. ein JPad-Modul.

## Klassen

Unter **Prüfungen** legt die Lehrkraft Klassen an (Name, optional Fach, Namensliste eintippen oder Klassenliste einlesen).
Jede Prüfung liegt automatisch in ihrer Klasse (gleicher Name und Fach im Schuljahr, `ensure_classes()`): fehlt sie, entsteht sie
mit der Namensliste der Prüfung. Klassen mit Prüfungen lassen sich nicht löschen. Die Namensliste ist verschlüsselt
(`classes.roster_enc`), jede:r hat eine feste Kennung (`sid`). Neue Prüfungen einer Klasse bekommen Klasse, Fach und
Namensliste; Coachings können eine Klasse übernehmen. **Noten** (`#/k/<id>`): Jede Auswertung legt eine verschlüsselte
Notenübersicht ab (`exams.notes_enc`); der Browser rechnet Ø große (Schulaufgaben), Ø kleine (Kurzarbeiten, AKL) und Gesamt
(Gewichtung je Klasse, Standard 2 : 1). Übungsprüfungen zählen nicht. Das Löschen eines Schuljahres löscht auch seine Klassen.
**Eigene Noten** (Abfrage, Unterrichtsbeitrag, Referat, Beobachtung, Projekt, Sonstiges): „＋ Noten eintragen“ für mehrere auf
einmal, Tipp auf einen Namen für eine Person (ändern, löschen). Jede Note zählt klein, groß oder gar nicht (Beobachtungen
standardmäßig nicht); Tendenzen ±0,25. Gespeichert als ein verschlüsselter Block je Klasse (`classes.marks_enc`, Einträge
`{id, sid, art, d, n, t, w}`); `marks_rev` verhindert, dass zwei Geräte sich überschreiben (der Browser wendet seine Änderung
auf den neuen Stand an).
**Noten importieren** (CSV mit Nachname, Vorname, Note; `;`, Tab oder `,`, Kopfzeile wird erkannt): Titel, klein/groß, Datum →
„Import prüfen“ zeigt je Name die Note (unscharfe Treffer gelb, Zeilen ohne Treffer zum Zuordnen) → eigene Spalte
(`marks.cols` `{id, t, w, d}`, Einträge mit `c`). Spaltenkopf antippen: Titel, Art, Datum, Noten ändern oder Spalte löschen.
**PlanPad** (`drop.php`, Tabelle `drops`): „⇄ PlanPad verbinden“ erzeugt einen Code (`PROBE1.` + Base64url von
`{v, u: …/drop.php, t: Token, k: öffentlicher Schlüssel, c: Klasse}`), der nur einmal angezeigt wird; der Server speichert nur
den Hash des Tokens. PlanPad schickt damit den ganzen Stand seiner Noten der Klasse (Datum, Note, Art, Unterrichtsnotiz,
Vor-/Nachname), verschlüsselt mit dem Schlüssel der Lehrkraft (`K.seal`-Format), per CORS ohne Cookies; jede Sendung
ersetzt die vorige. Der Token erlaubt nur Schreiben in diese eine Klasse. Probe ordnet von selbst nur bei gleichem Vor- und
Nachnamen zu; ein eindeutiger Vorname (oder abgekürzter Nachname) ist nur ein Vorschlag und zählt erst nach Bestätigung in
„Zuordnung prüfen“ (`marks.map`, `'-'` = bewusst nicht zuordnen; dort auch jede Zuordnung änderbar). Angezeigt wird die
PlanPad-Klasse, aus der die Noten kommen; passt nicht einmal die Hälfte der Namen, warnt Probe „Ist das die richtige Klasse?“; PlanPad-Noten sind in Probe nur lesbar, „zählt als“ lässt sich
ändern (`marks.ov`). „Verbindung trennen“ löscht die Ablage.

## Notizen

Bereich **Notizen** (intern `talks`, früher „Gespräche“): einzelne Gesprächsnotizen mit Schüler:innen, Eltern, Kolleg:innen oder frei – mit wem, Klasse, wann,
wo, Anlass, Thema, Ziele, Notizen, Vereinbarungen, Wiedervorlage, wer informiert ist. Keine Anhänge. Alles verschlüsselt für
die Lehrkraft (Tabelle `talks`: nur Schuljahr und Zeitpunkte im Klartext), automatisch gespeichert und bis zum Eintreffen beim
Server verschlüsselt in IndexedDB gepuffert. Filter, Suche, Wiedervorlagen, Druck, verschlüsselter Export (Passphrase).
Wie beim Coaching: nie automatisch löschen, ab 15. Juli bei jeder Anmeldung an Export/Löschen erinnern; der Admin löscht sie
mit den Coaching-Daten.

## Umfragen

Reiter **Umfragen**: Fragebogen im eingebetteten PathFinder gestalten (Art „Befragung“, Stil Lumi) – leer, aus einer Vorlage
(Feedback zum Unterricht, Klassenklima, Stimmungsbarometer), mit der KI („Umfrage erstellen“) oder als Text einer anderen KI.
Drei Arten der Teilnahme:

- **Anonym – ein QR-Code für alle** (Tafel, Beamer, Moodle). Ergebnisse ab 5 Antworten.
- **Anonym mit Einmal-Codes**: QR-Zettel (8 je A4-Seite) oder Links, mit oder ohne Namen. Jeder Code gilt einmal; verbrauchte
  Codes (`survey_used`) liegen getrennt von den Antworten, Antworten tragen weder Code noch Uhrzeit und eine zufällige Kennung
  (Tabellen `WITHOUT ROWID`). Ergebnisse erst nach dem Beenden (endgültig) und ab 5 Antworten.
- **Mit Namen**: persönliche QR-Codes, die Lehrkraft sieht, wer was geantwortet hat; erneutes Abschicken ersetzt.

Antworten, Teilnehmerliste und der Entwurf des Fragebogens sind mit dem Schlüssel der Lehrkraft verschlüsselt; im Klartext
liegen nur Titel, Gruppe, Zähler und der veröffentlichte Fragebogen (die Fragen). Die Mindestzahl prüft der Server: Vorher
liefert er die Antworten gar nicht aus. Auswertung je Frage (Mittelwert, Verteilung, Raster, Freitexte in zufälliger
Reihenfolge), Druck. Teilnehmende: `u.html?u=<Code>` (Player von PathFinder); auf dem Gerät bleibt nach dem Abschicken nur der
Vermerk „schon teilgenommen“ (IndexedDB, ohne Inhalt) bei anonymen Umfragen.

## Prüfungsformat und Claude-Skill

Prüfungen sind Texte im PathFinder-Textformat mit `Art: Prüfung`. Format, Aufgabenarten und Bewertung stehen in
[PRUEFUNGSFORMAT.md](https://github.com/alphabrumm/pathfinder/blob/main/docs/PRUEFUNGSFORMAT.md) (im Untermodul:
`vendor/pathfinder/docs/PRUEFUNGSFORMAT.md`). Der Claude-Skill **probe-pruefung**
(`vendor/pathfinder/docs/skill/probe-pruefung/SKILL.md`) erstellt damit in jedem Claude-Chat Prüfungen, die Probe unter
„Fertige Prüfung laden“ direkt einliest. Beides wird in PathFinder mit `node tools/doku.mjs` aus dem Code erzeugt.
**Ändert sich das Prüfungsformat, muss der Skill aktualisiert werden.**

## Verschlüsselung

Alles wird im Browser verschlüsselt (WebCrypto), der Server speichert nur Chiffretext:

* Jede Lehrkraft hat ein Schlüsselpaar (ECDH P-256). Der private Schlüssel liegt auf dem Server zweimal verschlüsselt:
  mit einem Schlüssel aus dem Passwort (PBKDF2-SHA256, 600 000 Runden) und mit einem aus dem Wiederherstellungscode.
* Aus dem Passwort entstehen zwei getrennte Werte: der **Login-Wert** (geht an den Server, dort mit `password_hash` gespeichert)
  und der **Passwort-Schlüssel** (verlässt den Browser nie). Der Server kennt das Passwort also nicht.
* Prüfungsinhalt mit Lösungen, Lösungsschlüssel und Klassenliste sind für den öffentlichen Schlüssel der Lehrkraft verschlüsselt.
  Im Klartext stehen nur Klasse, Fach, Datum, Art, Titel, Anzahl Aufgaben/Punkte.
* **Schülerfassung** (Aufgaben ohne Lösungen, `exams.student_enc`): AES-256-GCM mit einem zufälligen **Prüfungsschlüssel** je Prüfung.
  Den Schlüssel hat die Lehrkraft für sich verschlüsselt (`exams.skey_enc`); die Schüler bekommen ihn nur über den QR-Code bzw.
  Link (`s.html?c=<Code>#k=<Schlüssel>`, persönlicher QR-Code: Feld `k` in `#p=…`) – der Teil hinter „#“ geht nie an den Server.
  Ohne passenden Schlüssel zeigt die Schülerseite „Bitte den QR-Code neu scannen“, noch vor der Anmeldung. Beim Beenden der Prüfung
  löscht der Server die Schülerfassung. Ältere, noch unverschlüsselte Entwürfe stellt Probe beim nächsten Öffnen verschlüsselt neu
  fertig (persönliche QR-Codes dann neu drucken); starten lässt sich eine Prüfung nur noch verschlüsselt (DB v18).
* **Schul-Wiederherstellungsschlüssel** (Admin → Schulschlüssel, DB v19 `school_keys`): Notfallweg für Prüfungsarchive, wenn eine
  Lehrkraft ihre Archive nicht mehr öffnen kann. Schlüsselpaar wie bei den Lehrkräften; der private Teil ist mit der **Schul-Passphrase**
  verschlüsselt (24 Zeichen, 120 Bit, PBKDF2 600 000 Runden). Die Passphrase wird nur einmal angezeigt und als Blatt (PDF) für den Tresor
  der Schulleitung gedruckt – sie steht nie auf dem Server; aktiv wird der Schlüssel erst nach der Bestätigung „ausgedruckt“. Archive
  bekommen einen Empfänger `{t:'school', kid, pub, salt, rounds, priv, k}`: Der private Teil liegt (passphrase-verschlüsselt) im Archiv
  selbst, öffnen geht also mit Datei + Blatt auch ohne Server. Ein neuer Schulschlüssel ersetzt den alten; frühere Archive brauchen
  weiterhin ihr Blatt (Kennung steht im Archiv und auf dem Blatt). „Passphrase vom Blatt prüfen“ für die Tresor-Kontrolle.
  Gilt nur für Prüfungsarchive (bisher: Respizienz-Archive) – nie für Coaching, Gesprächsnotizen oder Fragebögen.
* Startpasswort vom Admin: rechnet ebenfalls der Browser um. Nach einem neuen Startpasswort öffnet nur der
  Wiederherstellungscode die alten Prüfungen wieder.
* **Admin-Passwort verloren** (und kein zweiter Admin): GitHub → Actions → „Probe – Notfall-Reset“ mit einem Startpasswort starten.
  Der Workflow legt per FTP `data/notfall.txt` ab (erzeugt mit `node tools/notfall.mjs [Nutzername|*] [Startpasswort]`); Probe setzt das
  Konto beim nächsten Aufruf darauf zurück, macht es zum Admin und löscht die Datei (Protokoll in `data/notfall.log`).
  Wer FTP-Zugang hat, hat ohnehin die Kontrolle über den Server – über das Web lässt sich die Datei nicht anlegen.

## Installation auf dem Webspace

1. Ordner per FTP hochladen (oder per GitHub Actions, siehe unten). Nötig: PHP 8.1+ mit `pdo_sqlite`, HTTPS.
2. Aufrufen, Admin-Konto anlegen.
3. Admin → **Sicherheit** prüfen: Die Datenbank darf von außen nicht abrufbar sein. Besser liegt der Datenordner außerhalb
   des Web-Verzeichnisses: `config.local.php` neben `api.php` mit `<?php return ['data' => '/pfad/ausserhalb/probe-daten'];`
4. PathFinder und Probe am besten unter derselben Domain betreiben – dann findet Probe beim Anlegen die Lernpfade,
   die im selben Browser in PathFinder gespeichert sind.

## Veröffentlichen

`.github/workflows/webspace.yml` überträgt per FTP(S): Push auf `test` → Test-Ordner, Push auf `live` (oder Tag `live-…`) → echter Ordner.

```
git push origin main:test     # auf dem Test-Ordner ausprobieren
git push origin main:live     # freigeben
```

Repository-Secrets: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_DIR`, `FTP_DIR_TEST` (optional Variable `FTP_PROTOCOL`).
`data/` und `config.local.php` auf dem Webspace werden nie überschrieben.

### Testinstanz

Die Testinstanz ist eine zweite, komplett getrennte Probe auf demselben Webspace: eigener Ordner (Secret `FTP_DIR_TEST`,
z. B. `/probe-test/`), am besten mit eigener Subdomain (z. B. `test-probe.pandapy.de` → dieser Ordner). Sie hat ihre eigene
Datenbank (`data/` im Test-Ordner) – also eigene Konten und Prüfungen, nichts geht in die echte Probe.

* `git push origin <zweig>:test` überträgt einen beliebigen Stand (auch einen Feature-Zweig) in den Test-Ordner.
* Der Test-Deploy schreibt zusätzlich `config.deploy.php`: Programmier-Aufgaben öffnen dort die **Test-Fassung von JPad**
  (`https://alphabrumm.github.io/jpad/`, änderbar mit der Repository-Variable `TEST_APP_JPAD`). Die echte Probe nutzt `https://jpad.pandapy.de/`.
* Eigene Einstellungen der Testinstanz gehen weiter in `config.local.php` im Test-Ordner (hat Vorrang).

## Programmier-Aufgaben (JPad, später QPad und FlowPad)

`### JPad: Titel` im Prüfungstext (Aufgabenart `app` in PathFinder): Die Schüler programmieren in JPad, das sich als Vollbild-Fenster
über der Prüfung öffnet; der Stand (Dateien und letzter Programmlauf) ist ihre Antwort und wird wie alle Antworten verschlüsselt.
Mehrere Aufgaben mit `Projekt: Name` bauen am selben Programm weiter. Bewertet wird automatisch nach Ausgabe und Pflicht-Code –
oder mit `Erwartung:` von der Lehrkraft. In der Auswertung öffnet „▶ In JPad öffnen“ den Code des Schülers zum Ausführen.
Adressen der Apps: Standard in `vendor/pathfinder/core/pfapp.js`, sonst `config.local.php` mit `'apps' => ['jpad' => 'https://…/']`.
Wie eine App angebunden wird: `vendor/pathfinder/docs/APP-AUFGABEN.md`.

Von Hand: `python3 tools/paket.py /tmp/probe-out --zip Webspace.zip` baut dasselbe Paket als Zip zum Entpacken im
Wurzelordner. Das Skript hängt an alle Skript- und Style-Verweise `?v=<Commit>` an, damit Safari nach einem Update keine
alten Dateien aus dem Zwischenspeicher verwendet; `.htaccess` setzt dazu `Cache-Control: no-cache`.
Deshalb nie den Repo-Ordner direkt hochladen, sondern immer das Paket.

## Lokal ausprobieren

```
git clone --recursive https://github.com/alphabrumm/probe && cd probe
php -S localhost:8800
```
(Der eingebaute PHP-Server beachtet keine `.htaccess` – der Sicherheitscheck meldet deshalb lokal die Datenbank als abrufbar.)

## Aufbau

| Datei | Zweck |
| --- | --- |
| `index.html`, `app/probe.js`, `app/probe.css` | Oberfläche (Einrichtung, Anmeldung, Prüfungen, Admin) |
| `app/crypto.js` | Schlüssel, Passwort-Ableitung, Ver- und Entschlüsseln |
| `editor.html` | PathFinder, eingebettet (nur Prüfungen), wird als Vollbild-Rahmen geöffnet |
| `api.php`, `intern/db.php` | Schnittstelle und Datenbank (SQLite, eine Datei) |
| `vendor/pathfinder` | PathFinder als Git-Untermodul |
