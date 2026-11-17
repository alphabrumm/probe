<?php
// Probe – Datenbank (eine SQLite-Datei) und Grundeinstellungen.
// Der Datenordner liegt standardmäßig in data/ (per .htaccess gesperrt). Besser außerhalb des Web-Verzeichnisses:
// dazu config.local.php anlegen mit  <?php return ['data' => '/pfad/ausserhalb/probe-daten'];

declare(strict_types=1);

function probe_config(): array {
    static $c = null;
    if ($c !== null) return $c;
    $c = ['data' => dirname(__DIR__) . '/data'];
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

function migrate(PDO $pdo): void {
    $v = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
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
}
