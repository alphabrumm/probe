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
* **Beispielprüfungen** für jede Lehrkraft und ein **Demo-Modus** ohne Konto (nach 4 Stunden gelöscht).

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
