# Hinweise für Claude

- **Prüfungsformat** (Aufgabenarten, Textformat, Bewertung) gehört PathFinder: `vendor/pathfinder/core/pftext.js`, `core/pfsplit.js`.
  Ändert sich daran etwas Relevantes, in PathFinder `node tools/doku.mjs` ausführen und dem Nutzer den aktualisierten
  Claude-Skill „probe-pruefung“ (`vendor/pathfinder/docs/skill/probe-pruefung/SKILL.md`) zum Speichern vorschlagen.
- Neue Datenbank-Migration (`intern/db.php`, `migrate_steps`): `DB_VERSION` erhöhen. Vor jedem Umbau sichert Probe die Datenbank
  automatisch nach `data/sicherungen/`; Migrationen laufen in einer Transaktion.
- Untermodul aktualisieren: `git -C vendor/pathfinder fetch && git -C vendor/pathfinder checkout <commit>`, dann hier committen.
- FTP-Deploy = Push `main:live`, nur auf „Go FTP“. `data/` und `config.local.php` nie ins Paket oder überschreiben.
- Geschlossene Prüfungen nehmen keine Nachreichung übers Netz an; Schüler-Geräte bekommen nie Lösungen.
- Testinstanz: `git push origin <zweig>:test` (eigener Ordner `FTP_DIR_TEST`, eigene Datenbank). Neue Funktionen dort zeigen lassen, bevor `live`.
  Der Test-Deploy schreibt `config.deploy.php` (Programmier-Aufgaben öffnen die Test-Fassung von JPad auf GitHub Pages).
- Programmier-Aufgaben (Typ `app`, JPad …): Protokoll und Anbindung weiterer Apps in `vendor/pathfinder/docs/APP-AUFGABEN.md`.
- **Coaching** (`app/coaching.js`, `app/cvorlagen.js`, `c.html`): Gesprächsnotizen und Fragebögen sind besonders schützenswert – nie im Klartext an den Server, nie an eine KI, nie automatisch löschen (nur Hinweis ab 15. Juli). Übergabe nur mit Einwilligung und nur Felder mit `w: true`.
