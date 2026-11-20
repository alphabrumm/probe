# Hinweise für Claude

- **Prüfungsformat** (Aufgabenarten, Textformat, Bewertung) gehört PathFinder: `vendor/pathfinder/core/pftext.js`, `core/pfsplit.js`.
  Ändert sich daran etwas Relevantes, in PathFinder `node tools/doku.mjs` ausführen und dem Nutzer den aktualisierten
  Claude-Skill „probe-pruefung“ (`vendor/pathfinder/docs/skill/probe-pruefung/SKILL.md`) zum Speichern vorschlagen.
- Untermodul aktualisieren: `git -C vendor/pathfinder fetch && git -C vendor/pathfinder checkout <commit>`, dann hier committen.
- FTP-Deploy = Push `main:live`, nur auf „Go FTP“. `data/` und `config.local.php` nie ins Paket oder überschreiben.
- Geschlossene Prüfungen nehmen keine Nachreichung übers Netz an; Schüler-Geräte bekommen nie Lösungen.
- Testinstanz: `git push origin <zweig>:test` (eigener Ordner `FTP_DIR_TEST`, eigene Datenbank). Neue Funktionen dort zeigen lassen, bevor `live`.
  Der Test-Deploy schreibt `config.deploy.php` (Programmier-Aufgaben öffnen die Test-Fassung von JPad auf GitHub Pages).
- Programmier-Aufgaben (Typ `app`, JPad …): Protokoll und Anbindung weiterer Apps in `vendor/pathfinder/docs/APP-AUFGABEN.md`.
- Prüfungs-Apps laufen in Prüfungen **innerhalb der Probe-Domain** in einem eigenen Unterordner (JPad: `/jpad/`, bald FlowPad,
  QPad, wEOS): Prüfungsfassung der App (startet nur in einer Probe-Prüfung), übertragen vom Workflow der App
  (Secret `PROBE_FTP_DIR`); Probe-Standard in `api.php` `APPS_DEFAULT`. Probe-Deploy löscht diese Ordner nicht (lftp ohne --delete).
