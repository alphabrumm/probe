# Probe – digitale Prüfungen

Probe ist eine leichtgewichtige Prüfungsplattform für das iPad im Klassenzimmer. Prüfungen entstehen mit
[PathFinder](https://github.com/alphabrumm/pathfinder) (als Untermodul in `vendor/pathfinder` eingebunden), Schüler brauchen
kein Konto. Läuft auf normalem Webspace mit PHP und SQLite.

> Der Name: Eine *probe* ist eine Raumsonde – und in Bayern heißt der Leistungsnachweis „Probe“.

## Stand: Phase 2 (Grundgerüst)

* **Einrichtung:** Beim allerersten Aufruf legst du das Admin-Konto an.
* **Admin:** Lehrkräfte (Kürzel = Login, Startpasswort, Admin, Fachleitung), Fachschaften mit ihren Fächern, Fächerliste
  (vorbelegt nach LehrplanPLUS Gymnasium Bayern), Schuljahresende „Prüfungen löschen“, Sicherheitscheck.
* **Lehrkraft:** erstes Anmelden mit Startpasswort → eigenes Passwort und Wiederherstellungscode. Übersicht
  Schuljahr → Klassen → Prüfungen. Neue Prüfung mit Klasse, Fach, Datum, Art (Schulaufgabe, Kurzarbeit, AKL, Übungsprüfung),
  Bearbeitungszeit, Teilnehmerzahl, Einlass-PIN, Notenskala. Inhalt mit dem eingebetteten PathFinder (aus einem Lernpfad,
  mit KI oder leer) oder als Prüfungsdatei. Klassenliste als CSV oder zum Einfügen.
* Phase 3 (Durchführung mit QR-Code) und Phase 4 (Auswertung) folgen.

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
| `api.php`, `lib/db.php` | Schnittstelle und Datenbank (SQLite, eine Datei) |
| `vendor/pathfinder` | PathFinder als Git-Untermodul |
