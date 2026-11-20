# Hinweise für Claude

- **Prüfungsformat** (Aufgabenarten, Textformat, Bewertung) gehört PathFinder: `vendor/pathfinder/core/pftext.js`, `core/pfsplit.js`.
  Ändert sich daran etwas Relevantes, in PathFinder `node tools/doku.mjs` ausführen und dem Nutzer den aktualisierten
  Claude-Skill „probe-pruefung“ (`vendor/pathfinder/docs/skill/probe-pruefung/SKILL.md`) zum Speichern vorschlagen.
- Untermodul aktualisieren: `git -C vendor/pathfinder fetch && git -C vendor/pathfinder checkout <commit>`, dann hier committen.
- FTP-Deploy = Push `main:live`, nur auf „Go FTP“. `data/` und `config.local.php` nie ins Paket oder überschreiben.
- Geschlossene Prüfungen nehmen keine Nachreichung übers Netz an; Schüler-Geräte bekommen nie Lösungen.
