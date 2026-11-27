<?php
// Probe – Datenbank (eine SQLite-Datei) und Grundeinstellungen.
// Der Datenordner liegt standardmäßig in data/ (per .htaccess gesperrt). Besser außerhalb des Web-Verzeichnisses:
// dazu config.local.php anlegen mit  <?php return ['data' => '/pfad/ausserhalb/probe-daten'];

declare(strict_types=1);

function probe_config(): array {
    static $c = null;
    if ($c !== null) return $c;
    $c = ['data' => dirname(__DIR__) . '/data'];
    // config.deploy.php schreibt nur der Test-Deploy (z. B. Adresse der Test-Fassung von JPad); config.local.php hat Vorrang
    $deploy = dirname(__DIR__) . '/config.deploy.php';
    if (is_file($deploy)) { $x = require $deploy; if (is_array($x)) $c = array_merge($c, $x); }
    $local = dirname(__DIR__) . '/config.local.php';
    if (is_file($local)) { $x = require $local; if (is_array($x)) $c = array_merge($c, $x); }
    return $c;
}

function data_dir(): string {
    $d = rtrim(probe_config()['data'], '/');
    if (!is_dir($d)) { mkdir($d, 0770, true); }
    // Schutz, falls der Ordner im Web-Verzeichnis liegt (Apache); zusätzlich leere index.html
    if (!is_file("$d/.htaccess")) file_put_contents("$d/.htaccess", "Require all denied\nDeny from all\n");
    if (!is_file("$d/index.html")) file_put_contents("$d/index.html", '');
    return $d;
}

/** Geheimnis des Servers (für Schein-Salze unbekannter Kürzel) */
function server_secret(): string {
    $f = data_dir() . '/secret.key';
    if (!is_file($f)) file_put_contents($f, bin2hex(random_bytes(32)));
    return trim((string)file_get_contents($f));
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO('sqlite:' . data_dir() . '/probe.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate($pdo);
    return $pdo;
}

const FAECHER = ['Berufliche Orientierung', 'Biologie', 'Chemie', 'Deutsch', 'Englisch', 'Ethik', 'Evangelische Religionslehre',
    'Französisch', 'Geographie', 'Geschichte', 'Griechisch', 'Informatik', 'Islamischer Unterricht', 'Israelitische Religionslehre',
    'Italienisch', 'Katholische Religionslehre', 'Kunst', 'Latein', 'Mathematik', 'Musik', 'Natur und Technik', 'Orthodoxe Religionslehre',
    'Physik', 'Politik und Gesellschaft', 'Russisch', 'Sozialpraktische Grundbildung', 'Spanisch', 'Sport', 'Wirtschaft und Recht',
    'Wirtschaftsinformatik'];

const ARTEN = ['Schulaufgabe', 'Kurzarbeit', 'AKL', 'Übungsprüfung'];

/* ---------- Sicherungen: vollständige Kopie der Datenbank in data/sicherungen/ (nicht abrufbar, wie data/) ---------- */
const DB_VERSION = 18;     // bei jeder neuen Migration erhöhen
const BACKUP_KEEP = 10;    // so viele Sicherungen bleiben, ältere werden gelöscht
function backup_dir(): string { $d = data_dir() . '/sicherungen'; if (!is_dir($d)) mkdir($d, 0770, true); return $d; }
function backup_log(string $m): void { @file_put_contents(backup_dir() . '/protokoll.log', date('Y-m-d H:i:s') . " $m\n", FILE_APPEND); }
/** in sich stimmige Kopie (auch bei laufendem Betrieb); Rückgabe: Dateiname oder null */
function db_snapshot(PDO $pdo, string $why): ?string {
    $why = preg_replace('~[^a-z0-9-]~', '', strtolower($why)) ?: 'manuell';
    $name = 'probe-' . date('Y-m-d-His') . "-$why-" . bin2hex(random_bytes(2)) . '.sqlite'; $f = backup_dir() . "/$name";
    try { $pdo->exec('VACUUM INTO ' . $pdo->quote($f)); }
    catch (Throwable $e) { // ältere SQLite ohne VACUUM INTO: Protokoll in die Datei übernehmen, dann kopieren
        try { $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)'); if (!@copy(data_dir() . '/probe.sqlite', $f)) throw new RuntimeException('Kopieren fehlgeschlagen'); }
        catch (Throwable $e2) { @unlink($f); backup_log("FEHLER ($why): " . $e->getMessage() . ' / ' . $e2->getMessage()); return null; }
    }
    @chmod($f, 0640); backup_log("angelegt $name (" . round(filesize($f) / 1024) . ' KB)');
    $all = glob(backup_dir() . '/probe-*.sqlite') ?: []; usort($all, fn($a, $b) => filemtime($b) <=> filemtime($a) ?: strcmp($b, $a));
    foreach (array_slice($all, BACKUP_KEEP) as $old) { @unlink($old); backup_log('gelöscht ' . basename($old) . ' (nur die letzten ' . BACKUP_KEEP . ' bleiben)'); }
    return $name;
}

/** Datenbank auf den neuesten Stand bringen: vorher eine Sicherung, dann alles in einer Transaktion (ganz oder gar nicht) */
function migrate(PDO $pdo): void {
    $v = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
    if ($v >= DB_VERSION) return;
    if ($v > 0) db_snapshot($pdo, "vor-v$v-auf-v" . DB_VERSION);
    $pdo->exec('BEGIN IMMEDIATE'); // ein zweiter gleichzeitiger Aufruf wartet und findet dann den neuen Stand vor
    try {
        $v = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
        if ($v < DB_VERSION) migrate_steps($pdo, $v);
        $pdo->exec('COMMIT');
    } catch (Throwable $e) { $pdo->exec('ROLLBACK'); throw $e; }
}
function migrate_steps(PDO $pdo, int $v): void {
    if ($v < 1) {
        $pdo->exec(<<<SQL
        CREATE TABLE users (
            id INTEGER PRIMARY KEY, kuerzel TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL DEFAULT '',
            is_admin INTEGER NOT NULL DEFAULT 0,
            salt TEXT NOT NULL, login_hash TEXT NOT NULL,          -- Login-Wert (im Browser aus dem Passwort abgeleitet), hier nochmals gehasht
            pub_key TEXT, priv_pw TEXT, rec_salt TEXT, priv_rec TEXT, -- Schlüsselpaar: privat nur verschlüsselt (Passwort bzw. Wiederherstellungscode)
            must_setup INTEGER NOT NULL DEFAULT 1,                  -- 1 = Startpasswort, beim nächsten Anmelden eigenes Passwort wählen
            created INTEGER NOT NULL, last_login INTEGER
        );
        CREATE TABLE fachschaften (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE faecher (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, sort INTEGER NOT NULL DEFAULT 0, aktiv INTEGER NOT NULL DEFAULT 1,
            fachschaft_id INTEGER REFERENCES fachschaften(id) ON DELETE SET NULL
        );
        CREATE TABLE fachleitungen (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            fachschaft_id INTEGER NOT NULL REFERENCES fachschaften(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, fachschaft_id)
        );
        CREATE TABLE exams (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            schuljahr TEXT NOT NULL, klasse TEXT NOT NULL, fach_id INTEGER REFERENCES faecher(id) ON DELETE SET NULL, fach TEXT NOT NULL DEFAULT '',
            datum TEXT NOT NULL DEFAULT '', art TEXT NOT NULL DEFAULT '', titel TEXT NOT NULL DEFAULT '',
            erwartet INTEGER NOT NULL DEFAULT 0, dauer INTEGER NOT NULL DEFAULT 0, pin_on INTEGER NOT NULL DEFAULT 1, skala TEXT NOT NULL DEFAULT 'noten',
            status TEXT NOT NULL DEFAULT 'entwurf',
            draft_enc TEXT, key_enc TEXT, student_doc TEXT, roster_enc TEXT, roster_n INTEGER NOT NULL DEFAULT 0,
            aufgaben INTEGER NOT NULL DEFAULT 0, punkte REAL NOT NULL DEFAULT 0, fertig INTEGER NOT NULL DEFAULT 0,
            created INTEGER NOT NULL, updated INTEGER NOT NULL
        );
        CREATE INDEX exams_owner ON exams(owner_id, schuljahr);
        CREATE TABLE login_fails (ip TEXT NOT NULL, kuerzel TEXT NOT NULL, t INTEGER NOT NULL);
        PRAGMA user_version = 1;
        SQL);
        $st = $pdo->prepare('INSERT INTO faecher (name, sort) VALUES (?, ?)');
        foreach (FAECHER as $i => $f) $st->execute([$f, $i * 10]);
    }
    if ($v < 2) { // Fächer, die eine Lehrkraft unterrichtet (legt der Admin an, die Lehrkraft kann ergänzen)
        $pdo->exec(<<<SQL
        CREATE TABLE user_faecher (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            fach_id INTEGER NOT NULL REFERENCES faecher(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, fach_id)
        );
        PRAGMA user_version = 2;
        SQL);
    }
    if ($v < 3) { // Durchführung und Auswertung
        $pdo->exec(<<<SQL
        ALTER TABLE exams ADD COLUMN code TEXT;
        ALTER TABLE exams ADD COLUMN pin TEXT NOT NULL DEFAULT '';
        ALTER TABLE exams ADD COLUMN join_open INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE exams ADD COLUMN opened INTEGER;
        ALTER TABLE exams ADD COLUMN closed INTEGER;
        ALTER TABLE exams ADD COLUMN ended INTEGER;
        ALTER TABLE exams ADD COLUMN grading_enc TEXT;
        ALTER TABLE exams ADD COLUMN published INTEGER;
        ALTER TABLE exams ADD COLUMN expires INTEGER;
        CREATE UNIQUE INDEX exams_code ON exams(code);
        CREATE TABLE participants (
            id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE, identity_enc TEXT NOT NULL,     -- Name und Ergebniscode, verschlüsselt für die Lehrkraft
            status TEXT NOT NULL DEFAULT 'aktiv',                            -- aktiv | abgegeben
            joined INTEGER NOT NULL, last_seen INTEGER NOT NULL, saved INTEGER, n_saves INTEGER NOT NULL DEFAULT 0,
            zuschlag INTEGER NOT NULL DEFAULT 0, fokus INTEGER NOT NULL DEFAULT 0, imported INTEGER NOT NULL DEFAULT 0,
            answers_enc TEXT                                                 -- letzter Stand der Antworten, verschlüsselt für die Lehrkraft
        );
        CREATE INDEX participants_exam ON participants(exam_id);
        CREATE TABLE reports (rid TEXT PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE, report_enc TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE report_comments (id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE, rid TEXT NOT NULL, comment_enc TEXT NOT NULL, created INTEGER NOT NULL, gelesen INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE join_fails (k TEXT NOT NULL, ip TEXT NOT NULL, t INTEGER NOT NULL);
        PRAGMA user_version = 3;
        SQL);
    }
    if ($v < 4) { // Zeit für alle verlängern, automatische Abgabe abschaltbar
        $pdo->exec(<<<SQL
        ALTER TABLE exams ADD COLUMN verlaengert INTEGER NOT NULL DEFAULT 0;   -- Minuten für alle
        ALTER TABLE exams ADD COLUMN auto_abgabe INTEGER NOT NULL DEFAULT 1;   -- bei 0:00 automatisch abgeben
        ALTER TABLE exams ADD COLUMN auto_set INTEGER;                         -- wann die automatische Abgabe zuletzt eingeschaltet wurde
        PRAGMA user_version = 4;
        SQL);
    }
    if ($v < 5) { // Beispielprüfungen je Lehrkraft (einmalig angelegt)
        $pdo->exec(<<<SQL
        ALTER TABLE users ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 5;
        SQL);
    }
    if ($v < 6) { // Demo-Modus: vorübergehende Konten ohne Anmeldung
        $pdo->exec(<<<SQL
        ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 6;
        SQL);
    }
    if ($v < 7) { // Respizienz: korrigierte Prüfung mit Klarnamen an die Fachleitung (verschlüsselt je Empfänger)
        $pdo->exec(<<<SQL
        CREATE TABLE respizienz (
            id INTEGER PRIMARY KEY, exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL, owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            lehrkraft TEXT NOT NULL DEFAULT '', fachschaft_id INTEGER REFERENCES fachschaften(id) ON DELETE SET NULL,
            schuljahr TEXT NOT NULL, klasse TEXT NOT NULL, fach TEXT NOT NULL, art TEXT NOT NULL, datum TEXT NOT NULL, titel TEXT NOT NULL DEFAULT '', teilnehmer INTEGER NOT NULL DEFAULT 0,
            created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'eingereicht',   -- eingereicht | gesehen | abgezeichnet
            seen INTEGER, signed INTEGER, signer_id INTEGER REFERENCES users(id) ON DELETE SET NULL, signer TEXT NOT NULL DEFAULT '',
            note_enc TEXT                                                      -- Bemerkung der Fachleitung, verschlüsselt für die Lehrkraft
        );
        CREATE INDEX respizienz_exam ON respizienz(exam_id);
        CREATE TABLE respizienz_keys (resp_id INTEGER NOT NULL REFERENCES respizienz(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            data_enc TEXT NOT NULL, PRIMARY KEY (resp_id, user_id));
        PRAGMA user_version = 7;
        SQL);
    }
    if ($v < 8) { // Respizienz: Rückfrage an die Lehrkraft, Notizen der Fachleitung (je Empfänger verschlüsselt), erneutes Einreichen behält den Verlauf
        $pdo->exec(<<<SQL
        ALTER TABLE respizienz ADD COLUMN updated INTEGER;                  -- zuletzt (erneut) eingereicht
        ALTER TABLE respizienz ADD COLUMN rueck INTEGER;                    -- Rückfrage an die Lehrkraft gestellt
        CREATE TABLE respizienz_notes (
            id INTEGER PRIMARY KEY, resp_id INTEGER NOT NULL REFERENCES respizienz(id) ON DELETE CASCADE,
            author_id INTEGER REFERENCES users(id) ON DELETE SET NULL, author TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
            for_teacher INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'notiz', -- notiz | rueckfrage | abgezeichnet
            enc TEXT NOT NULL                                                   -- JSON { user_id: verschlüsselter Text } – nur die Empfänger können lesen
        );
        CREATE INDEX respizienz_notes_resp ON respizienz_notes(resp_id);
        PRAGMA user_version = 8;
        SQL);
    }
    if ($v < 9) { // Persönliche QR-Codes: Schüler melden sich mit einem eigenen QR-Code an (Prüfungscode wird dafür schon vor dem Start vergeben)
        $pdo->exec(<<<SQL
        ALTER TABLE exams ADD COLUMN pqr INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 9;
        SQL);
    }
    if ($v < 10) { // Coaching: Fragebogen der Schüler (verschlüsselt für die Klassleitung), Gesprächsnotizen, anonymisierte Auswertung für die Schulberatung
        $pdo->exec(<<<SQL
        ALTER TABLE users ADD COLUMN is_berater INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE coachings (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            schuljahr TEXT NOT NULL, klasse TEXT NOT NULL, titel TEXT NOT NULL DEFAULT '',
            vorlage TEXT NOT NULL, gbogen TEXT NOT NULL,                     -- Reflexionsbogen der Schüler, Gesprächsbogen der Lehrkraft
            code TEXT NOT NULL UNIQUE, open INTEGER NOT NULL DEFAULT 1,       -- Fragebogen annehmen?
            roster_enc TEXT, roster_n INTEGER NOT NULL DEFAULT 0,             -- Klassenliste mit persönlichen Schlüsseln, verschlüsselt
            tids TEXT NOT NULL DEFAULT '[]',                                  -- Prüfwerte der persönlichen Schlüssel (SHA-256), nicht umkehrbar
            exported INTEGER, reported INTEGER, created INTEGER NOT NULL, updated INTEGER NOT NULL
        );
        CREATE INDEX coachings_owner ON coachings(owner_id, schuljahr);
        CREATE TABLE coaching_subs (
            coaching_id INTEGER NOT NULL REFERENCES coachings(id) ON DELETE CASCADE, tid TEXT NOT NULL,
            identity_enc TEXT NOT NULL, answers_enc TEXT NOT NULL, at INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (coaching_id, tid)
        );
        CREATE TABLE coaching_notes (
            coaching_id INTEGER NOT NULL REFERENCES coachings(id) ON DELETE CASCADE, tid TEXT NOT NULL,
            note_enc TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL,
            PRIMARY KEY (coaching_id, tid)
        );
        CREATE TABLE coaching_reports (
            id INTEGER PRIMARY KEY, coaching_id INTEGER UNIQUE REFERENCES coachings(id) ON DELETE SET NULL,
            owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, lehrkraft TEXT NOT NULL DEFAULT '',
            schuljahr TEXT NOT NULL, klasse TEXT NOT NULL, jgst INTEGER NOT NULL DEFAULT 0, vorlage TEXT NOT NULL DEFAULT '',
            enc TEXT NOT NULL, created INTEGER NOT NULL                       -- JSON { user_id: verschlüsselte Zahlen } – nur die Schulberatung kann lesen
        );
        PRAGMA user_version = 10;
        SQL);
    }
    if ($v < 11) { // Umfragen: Fragebogen aus PathFinder (Befragung), anonym (Tafel-QR), anonym mit Einmal-Codes oder mit Namen
        $pdo->exec(<<<SQL
        CREATE TABLE surveys (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            schuljahr TEXT NOT NULL, gruppe TEXT NOT NULL DEFAULT '', titel TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL,                                               -- tafel | einmal | name
            code TEXT NOT NULL UNIQUE, open INTEGER NOT NULL DEFAULT 0, ended INTEGER,
            doc_enc TEXT,                                                     -- Fragebogen zum Bearbeiten, verschlüsselt für die Lehrkraft
            pub_doc TEXT,                                                     -- veröffentlichter Fragebogen (nur Fragen, für die Teilnehmenden)
            roster_enc TEXT, roster_n INTEGER NOT NULL DEFAULT 0,             -- Teilnehmende bzw. Einmal-Codes, verschlüsselt
            tids TEXT NOT NULL DEFAULT '[]',                                  -- Prüfwerte der Codes (SHA-256)
            created INTEGER NOT NULL, updated INTEGER NOT NULL
        );
        CREATE INDEX surveys_owner ON surveys(owner_id, schuljahr);
        -- Antworten: verschlüsselt für die Lehrkraft. Anonyme Antworten tragen weder Code noch Zeit, ihre Kennung ist zufällig
        -- (WITHOUT ROWID: gespeichert nach Kennung, nicht nach Eingang) – so lässt sich keine Antwort einem Code zuordnen.
        CREATE TABLE survey_answers (survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE, k TEXT NOT NULL, answers_enc TEXT NOT NULL,
            PRIMARY KEY (survey_id, k)) WITHOUT ROWID;
        -- verbrauchte Einmal-Codes, getrennt von den Antworten
        CREATE TABLE survey_used (survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE, tid TEXT NOT NULL,
            PRIMARY KEY (survey_id, tid)) WITHOUT ROWID;
        PRAGMA user_version = 11;
        SQL);
    }
    if ($v < 12) { // Coaching-Vorlagen der Schule: von der Schulberatung in PathFinder gestaltet (nur Fragen, keine Personendaten)
        $pdo->exec(<<<SQL
        CREATE TABLE ctemplates (
            id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,                                               -- reflexion | gespraech
            label TEXT NOT NULL DEFAULT '', doc TEXT NOT NULL, spec TEXT NOT NULL, -- PathFinder-Dokument, daraus die Vorlage
            active INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL
        );
        ALTER TABLE coachings ADD COLUMN rspec TEXT;                          -- Kopie der Schulvorlage (Selbstreflexion) beim Anlegen
        ALTER TABLE coachings ADD COLUMN gspec TEXT;                          -- Kopie der Schulvorlage (Gesprächsbogen)
        PRAGMA user_version = 12;
        SQL);
    }
    if ($v < 13) { // Gespräche: einzelne Gesprächsnotizen (Schüler:in, Eltern, Kollegium …) – alles verschlüsselt für die Lehrkraft
        $pdo->exec(<<<SQL
        CREATE TABLE talks (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            schuljahr TEXT NOT NULL, enc TEXT NOT NULL,                       -- wer, wann, wo, Thema, Ziele, Notizen, Vereinbarungen: nur verschlüsselt
            exported INTEGER, created INTEGER NOT NULL, updated INTEGER NOT NULL
        );
        CREATE INDEX talks_owner ON talks(owner_id, schuljahr);
        PRAGMA user_version = 13;
        SQL);
    }
    if ($v < 14) { // Klassen: Lerngruppe der Lehrkraft mit Namensliste (verschlüsselt); Prüfungen und Coachings übernehmen sie
        $pdo->exec(<<<SQL
        CREATE TABLE classes (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            schuljahr TEXT NOT NULL, name TEXT NOT NULL, fach_id INTEGER REFERENCES faecher(id) ON DELETE SET NULL, fach TEXT NOT NULL DEFAULT '',
            roster_enc TEXT, roster_n INTEGER NOT NULL DEFAULT 0,             -- Namen (mit fester Kennung je Schüler), verschlüsselt
            gewicht INTEGER NOT NULL DEFAULT 2,                               -- große : kleine Leistungsnachweise = gewicht : 1
            created INTEGER NOT NULL, updated INTEGER NOT NULL
        );
        CREATE INDEX classes_owner ON classes(owner_id, schuljahr);
        ALTER TABLE exams ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL;
        ALTER TABLE exams ADD COLUMN notes_enc TEXT;                         -- Notenübersicht der Auswertung (für die Klasse), verschlüsselt
        ALTER TABLE coachings ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL;
        PRAGMA user_version = 14;
        SQL);
    }
    if ($v < 15) { // Klassen: eigene Noten (mündlich, Referat, Beobachtung …), verschlüsselt; rev gegen gleichzeitiges Speichern auf zwei Geräten
        $pdo->exec(<<<SQL
        ALTER TABLE classes ADD COLUMN marks_enc TEXT;
        ALTER TABLE classes ADD COLUMN marks_rev INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 15;
        SQL);
    }
    if ($v < 16) { // PlanPad → Probe: Ablage je Klasse (nur schreiben mit Token; Inhalt mit dem Schlüssel der Lehrkraft verschlüsselt)
        $pdo->exec(<<<SQL
        CREATE TABLE drops (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            class_id INTEGER NOT NULL UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE, data_enc TEXT, n INTEGER NOT NULL DEFAULT 0,  -- letzter Stand aus PlanPad (Noten mit Notiz), verschlüsselt
            created INTEGER NOT NULL, updated INTEGER
        );
        PRAGMA user_version = 16;
        SQL);
    }
    if ($v < 17) { // Einstellungen je Lehrkraft (welche Bereiche im Menü stehen, PlanPad-Kopplung) – nichts Personenbezogenes über SuS
        $pdo->exec(<<<SQL
        ALTER TABLE users ADD COLUMN prefs TEXT;
        UPDATE users SET prefs = '{"notizen":' || CASE WHEN EXISTS (SELECT 1 FROM talks t WHERE t.owner_id = users.id) THEN 'true' ELSE 'false' END
            || ',"umfragen":' || CASE WHEN EXISTS (SELECT 1 FROM surveys s WHERE s.owner_id = users.id) THEN 'true' ELSE 'false' END || '}'; -- wer sie schon nutzt, behält sie im Menü
        PRAGMA user_version = 17;
        SQL);
    }
    if ($v < 18) { // Schülerfassung nur noch verschlüsselt (Schlüssel kennt nur die Lehrkraft, Schüler bekommen ihn über den QR-Code); nach dem Ende gelöscht
        $pdo->exec(<<<SQL
        ALTER TABLE exams ADD COLUMN skey_enc TEXT;     -- Prüfungsschlüssel, verschlüsselt für die Lehrkraft
        ALTER TABLE exams ADD COLUMN student_enc TEXT;  -- Schülerfassung, AES-GCM mit dem Prüfungsschlüssel
        UPDATE exams SET student_doc = NULL WHERE status IN ('beendet', 'veroeffentlicht');
        PRAGMA user_version = 18;
        SQL);
    }
}
