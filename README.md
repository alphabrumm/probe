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
  Im Klartext stehen nur Klasse, Fach, Datum, Art, Titel, Anzahl Aufgaben/Punkte – und die Schülerfassung **ohne** Lösungen.
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
