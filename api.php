<?php
// Probe – Schnittstelle für die Oberfläche. Aufruf: POST api.php mit JSON { "a": "aktion", … }.
// Der Server sieht nie Passwörter, Schülernamen, Antworten oder Lösungen im Klartext: Diese verschlüsselt der Browser.

declare(strict_types=1);
require __DIR__ . '/lib/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function out(array $data, int $code = 200): never { http_response_code($code); echo json_encode(['ok' => $code < 400] + $data, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $msg, int $code = 400): never { out(['error' => $msg], $code); }

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_name('probe_sid');
session_set_cookie_params(['lifetime' => 0, 'path' => rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Nur POST', 405);
if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) fail('JSON erwartet', 415);
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) fail('Ungültige Anfrage');
$a = (string)($in['a'] ?? '');

const IDLE = 8 * 3600; // nach 8 Stunden ohne Aktivität abmelden
$uid = (int)($_SESSION['uid'] ?? 0);
if ($uid && time() - (int)($_SESSION['seen'] ?? 0) > IDLE) { $_SESSION = []; session_regenerate_id(true); $uid = 0; }
if ($uid) $_SESSION['seen'] = time();

/* ---------- Hilfen ---------- */
function str(array $in, string $k, int $max = 200, bool $req = false): string {
    $v = trim((string)($in[$k] ?? ''));
    if ($req && $v === '') fail("„{$k}“ fehlt");
    if (mb_strlen($v) > $max) fail("„{$k}“ ist zu lang");
    return $v;
}
function blob(array $in, string $k, int $max = 20_000_000): ?string {
    if (!array_key_exists($k, $in) || $in[$k] === null) return null;
    $v = (string)$in[$k]; if (strlen($v) > $max) fail('Daten zu groß'); return $v;
}
function b64ok(string $s, int $min = 16): bool { return strlen($s) >= $min && preg_match('~^[A-Za-z0-9+/=_-]+$~', $s) === 1; }
function hexok(string $s): bool { return preg_match('~^[0-9a-f]{64}$~', $s) === 1; }
function user(int $id): ?array { $st = db()->prepare('SELECT * FROM users WHERE id = ?'); $st->execute([$id]); return $st->fetch() ?: null; }
function me(): array {
    global $uid; if (!$uid) fail('Bitte anmelden', 401);
    $u = user($uid); if (!$u) { $_SESSION = []; fail('Bitte anmelden', 401); }
    return $u;
}
function csrf(): void {
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)($_SERVER['HTTP_X_PROBE_CSRF'] ?? ''))) fail('Sitzung abgelaufen – bitte neu laden', 403);
}
function need_keys(array $u): void { if ($u['must_setup']) fail('Bitte zuerst ein eigenes Passwort festlegen', 403); }
function admin(): array { $u = me(); csrf(); need_keys($u); if (!$u['is_admin']) fail('Nur für Admins', 403); return $u; }
function teacher(): array { $u = me(); csrf(); need_keys($u); return $u; }
function fake_salt(string $k): string { return base64_encode(substr(hash_hmac('sha256', mb_strtolower($k), server_secret(), true), 0, 16)); }
function ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }
function ufields(array $u): array {
    $fl = db()->prepare('SELECT f.id, f.name FROM fachleitungen l JOIN fachschaften f ON f.id = l.fachschaft_id WHERE l.user_id = ? ORDER BY f.name');
    $fl->execute([$u['id']]);
    return ['id' => (int)$u['id'], 'kuerzel' => $u['kuerzel'], 'name' => $u['name'], 'is_admin' => (bool)$u['is_admin'], 'must_setup' => (bool)$u['must_setup'],
        'has_keys' => (bool)$u['pub_key'], 'fachleitung' => $fl->fetchAll(), 'faecher' => user_faecher((int)$u['id'])];
}
function user_faecher(int $id): array {
    $st = db()->prepare('SELECT fach_id FROM user_faecher WHERE user_id = ?'); $st->execute([$id]);
    return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}
function set_user_faecher(int $id, array $ids): void {
    db()->prepare('DELETE FROM user_faecher WHERE user_id = ?')->execute([$id]);
    $st = db()->prepare('INSERT OR IGNORE INTO user_faecher (user_id, fach_id) SELECT ?, id FROM faecher WHERE id = ?');
    foreach ($ids as $f) $st->execute([$id, (int)$f]);
}
function keys(array $u): array { return ['pub_key' => $u['pub_key'], 'priv_pw' => $u['priv_pw'], 'rec_salt' => $u['rec_salt'], 'priv_rec' => $u['priv_rec']]; }
function schuljahr(?string $datum = null): string {
    $t = $datum && preg_match('~^\d{4}-\d{2}-\d{2}$~', $datum) ? strtotime($datum) : time();
    $y = (int)date('Y', $t); $m = (int)date('n', $t);
    $s = $m >= 8 ? $y : $y - 1;
    return $s . '/' . str_pad((string)(($s + 1) % 100), 2, '0', STR_PAD_LEFT);
}
function own_exam(array $u, int $id): array {
    $st = db()->prepare('SELECT * FROM exams WHERE id = ? AND owner_id = ?'); $st->execute([$id, $u['id']]);
    return $st->fetch() ?: fail('Prüfung nicht gefunden', 404);
}
function exam_meta(array $e): array {
    return ['id' => (int)$e['id'], 'schuljahr' => $e['schuljahr'], 'klasse' => $e['klasse'], 'fach_id' => $e['fach_id'] ? (int)$e['fach_id'] : null, 'fach' => $e['fach'],
        'datum' => $e['datum'], 'art' => $e['art'], 'titel' => $e['titel'], 'erwartet' => (int)$e['erwartet'], 'dauer' => (int)$e['dauer'], 'pin_on' => (bool)$e['pin_on'],
        'skala' => $e['skala'], 'status' => $e['status'], 'roster_n' => (int)$e['roster_n'], 'aufgaben' => (int)$e['aufgaben'], 'punkte' => (float)$e['punkte'],
        'fertig' => (bool)$e['fertig'], 'has_draft' => (bool)$e['draft_enc'], 'updated' => (int)$e['updated']];
}

/* ---------- Anmeldung und Schlüssel ---------- */
switch ($a) {
case 'status': {
    $n = (int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $u = $uid ? user($uid) : null;
    if ($u && empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    out(['setup' => $n === 0, 'user' => $u ? ufields($u) : null, 'csrf' => $u ? $_SESSION['csrf'] : null, 'keys' => $u ? keys($u) : null,
        'https' => $GLOBALS['https']]);
}
case 'setup_admin': { // allererster Start: das erste Konto ist Admin, mit eigenem Passwort und Schlüsseln
    $pdo = db(); $pdo->beginTransaction();
    if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) fail('Probe ist schon eingerichtet', 409);
    $k = str($in, 'kuerzel', 20, true); if (!preg_match('~^[\p{L}0-9._-]{2,20}$~u', $k)) fail('Kürzel: 2–20 Buchstaben oder Ziffern');
    $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true);
    foreach (['pub_key', 'priv_pw', 'rec_salt', 'priv_rec'] as $f) if (!b64ok(str($in, $f, 4000, true))) fail('Schlüssel ungültig');
    if (!b64ok($salt) || !hexok($auth)) fail('Ungültige Anmeldedaten');
    $pdo->prepare('INSERT INTO users (kuerzel, name, is_admin, salt, login_hash, pub_key, priv_pw, rec_salt, priv_rec, must_setup, created, last_login) VALUES (?,?,1,?,?,?,?,?,?,0,?,?)')
        ->execute([$k, str($in, 'name', 80), $salt, password_hash($auth, PASSWORD_DEFAULT), $in['pub_key'], $in['priv_pw'], $in['rec_salt'], $in['priv_rec'], time(), time()]);
    $id = (int)$pdo->lastInsertId(); $pdo->commit();
    session_regenerate_id(true); $_SESSION = ['uid' => $id, 'seen' => time(), 'csrf' => bin2hex(random_bytes(16))];
    $u = user($id); out(['user' => ufields($u), 'csrf' => $_SESSION['csrf'], 'keys' => keys($u)]);
}
case 'prelogin': { // Salz zum Kürzel (für unbekannte Kürzel ein gleichbleibendes Schein-Salz)
    $k = str($in, 'kuerzel', 20, true);
    $st = db()->prepare('SELECT salt FROM users WHERE kuerzel = ?'); $st->execute([$k]);
    out(['salt' => $st->fetchColumn() ?: fake_salt($k)]);
}
case 'login': {
    $k = str($in, 'kuerzel', 20, true); $auth = str($in, 'auth', 64, true);
    $pdo = db(); $pdo->prepare('DELETE FROM login_fails WHERE t < ?')->execute([time() - 900]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM login_fails WHERE ip = ? OR kuerzel = ?'); $st->execute([ip(), mb_strtolower($k)]);
    if ((int)$st->fetchColumn() >= 10) fail('Zu viele Fehlversuche – bitte 15 Minuten warten', 429);
    $st = $pdo->prepare('SELECT * FROM users WHERE kuerzel = ?'); $st->execute([$k]); $u = $st->fetch();
    if (!$u || !password_verify($auth, $u['login_hash'])) {
        $pdo->prepare('INSERT INTO login_fails (ip, kuerzel, t) VALUES (?,?,?)')->execute([ip(), mb_strtolower($k), time()]);
        usleep(300000); fail('Kürzel oder Passwort stimmt nicht', 401);
    }
    $pdo->prepare('UPDATE users SET last_login = ? WHERE id = ?')->execute([time(), $u['id']]);
    session_regenerate_id(true); $_SESSION = ['uid' => (int)$u['id'], 'seen' => time(), 'csrf' => bin2hex(random_bytes(16))];
    out(['user' => ufields($u), 'csrf' => $_SESSION['csrf'], 'keys' => keys($u)]);
}
case 'logout': { $_SESSION = []; session_destroy(); out([]); }
case 'unlock_check': { // Passwort erneut prüfen (Sitzung noch gültig, Schlüssel nach Neuladen wieder entsperren)
    $u = me(); csrf();
    $pdo = db(); $st = $pdo->prepare('SELECT COUNT(*) FROM login_fails WHERE kuerzel = ? AND t > ?'); $st->execute([mb_strtolower($u['kuerzel']), time() - 900]);
    if ((int)$st->fetchColumn() >= 10) fail('Zu viele Fehlversuche – bitte 15 Minuten warten', 429);
    if (!password_verify(str($in, 'auth', 64, true), $u['login_hash'])) { $pdo->prepare('INSERT INTO login_fails (ip, kuerzel, t) VALUES (?,?,?)')->execute([ip(), mb_strtolower($u['kuerzel']), time()]); usleep(300000); fail('Passwort stimmt nicht', 401); }
    out(['salt' => $u['salt']]);
}
case 'setup_keys': { // erstes Anmelden mit Startpasswort: eigenes Passwort und Schlüsselpaar (neu oder per Wiederherstellungscode behalten)
    $u = me(); csrf(); if (!$u['must_setup']) fail('Schon eingerichtet', 409);
    $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true);
    if (!b64ok($salt) || !hexok($auth) || !b64ok(str($in, 'priv_pw', 4000, true))) fail('Ungültige Daten');
    if (!empty($in['keep'])) { // vorhandene Schlüssel behalten (mit Wiederherstellungscode entsperrt)
        if (!$u['pub_key']) fail('Keine Schlüssel vorhanden');
        db()->prepare('UPDATE users SET salt = ?, login_hash = ?, priv_pw = ?, must_setup = 0 WHERE id = ?')->execute([$salt, password_hash($auth, PASSWORD_DEFAULT), $in['priv_pw'], $u['id']]);
    } else {
        foreach (['pub_key', 'rec_salt', 'priv_rec'] as $f) if (!b64ok(str($in, $f, 4000, true))) fail('Schlüssel ungültig');
        $pdo = db(); $pdo->beginTransaction();
        if ($u['pub_key']) $pdo->prepare('DELETE FROM exams WHERE owner_id = ?')->execute([$u['id']]); // alte Daten sind ohne Schlüssel unlesbar
        $pdo->prepare('UPDATE users SET salt = ?, login_hash = ?, pub_key = ?, priv_pw = ?, rec_salt = ?, priv_rec = ?, must_setup = 0 WHERE id = ?')
            ->execute([$salt, password_hash($auth, PASSWORD_DEFAULT), $in['pub_key'], $in['priv_pw'], $in['rec_salt'], $in['priv_rec'], $u['id']]);
        $pdo->commit();
    }
    $u = user((int)$u['id']); out(['user' => ufields($u), 'keys' => keys($u)]);
}
case 'change_password': {
    $u = teacher();
    if (!password_verify(str($in, 'old_auth', 64, true), $u['login_hash'])) fail('Bisheriges Passwort stimmt nicht', 401);
    $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true);
    if (!b64ok($salt) || !hexok($auth) || !b64ok(str($in, 'priv_pw', 4000, true))) fail('Ungültige Daten');
    db()->prepare('UPDATE users SET salt = ?, login_hash = ?, priv_pw = ? WHERE id = ?')->execute([$salt, password_hash($auth, PASSWORD_DEFAULT), $in['priv_pw'], $u['id']]);
    out([]);
}

/* ---------- Admin ---------- */
case 'admin_list': {
    admin(); $pdo = db();
    $users = $pdo->query('SELECT id, kuerzel, name, is_admin, must_setup, pub_key IS NOT NULL AS has_keys, last_login FROM users ORDER BY kuerzel')->fetchAll();
    $fl = $pdo->query('SELECT user_id, fachschaft_id FROM fachleitungen')->fetchAll();
    foreach ($users as &$x) { $x['fachleitung'] = array_values(array_map(fn($r) => (int)$r['fachschaft_id'], array_filter($fl, fn($r) => (int)$r['user_id'] === (int)$x['id']))); $x['faecher'] = user_faecher((int)$x['id']); }
    unset($x);
    $ex = $pdo->query('SELECT schuljahr, COUNT(*) AS n FROM exams GROUP BY schuljahr ORDER BY schuljahr DESC')->fetchAll();
    out(['users' => $users, 'fachschaften' => $pdo->query('SELECT * FROM fachschaften ORDER BY name')->fetchAll(),
        'faecher' => $pdo->query('SELECT * FROM faecher ORDER BY sort, name')->fetchAll(), 'exams' => $ex]);
}
case 'user_save': {
    admin(); $pdo = db();
    $id = (int)($in['id'] ?? 0); $k = str($in, 'kuerzel', 20, true); $name = str($in, 'name', 80);
    if (!preg_match('~^[\p{L}0-9._-]{2,20}$~u', $k)) fail('Kürzel: 2–20 Buchstaben oder Ziffern');
    $isAdmin = !empty($in['is_admin']) ? 1 : 0;
    $pdo->beginTransaction();
    try {
        if ($id) {
            if (!$isAdmin && (int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_admin = 1 AND id <> ' . $id)->fetchColumn() === 0) fail('Mindestens ein Admin muss bleiben');
            $pdo->prepare('UPDATE users SET kuerzel = ?, name = ?, is_admin = ? WHERE id = ?')->execute([$k, $name, $isAdmin, $id]);
        } else { // Startpasswort: Salz und Login-Wert rechnet der Browser des Admins aus
            $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true); if (!b64ok($salt) || !hexok($auth)) fail('Ungültiges Startpasswort');
            $pdo->prepare('INSERT INTO users (kuerzel, name, is_admin, salt, login_hash, must_setup, created) VALUES (?,?,?,?,?,1,?)')
                ->execute([$k, $name, $isAdmin, $salt, password_hash($auth, PASSWORD_DEFAULT), time()]);
            $id = (int)$pdo->lastInsertId();
        }
        $pdo->prepare('DELETE FROM fachleitungen WHERE user_id = ?')->execute([$id]);
        $st = $pdo->prepare('INSERT INTO fachleitungen (user_id, fachschaft_id) VALUES (?, ?)');
        foreach ((array)($in['fachleitung'] ?? []) as $f) $st->execute([$id, (int)$f]);
        if (isset($in['faecher'])) set_user_faecher($id, (array)$in['faecher']);
        $pdo->commit();
    } catch (PDOException $e) { $pdo->rollBack(); fail(str_contains($e->getMessage(), 'UNIQUE') ? 'Dieses Kürzel gibt es schon' : 'Speichern fehlgeschlagen'); }
    out(['id' => $id]);
}
case 'user_reset': { // Startpasswort neu setzen; die Lehrkraft braucht danach ihren Wiederherstellungscode
    admin(); $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true); if (!b64ok($salt) || !hexok($auth)) fail('Ungültiges Startpasswort');
    db()->prepare('UPDATE users SET salt = ?, login_hash = ?, must_setup = 1 WHERE id = ?')->execute([$salt, password_hash($auth, PASSWORD_DEFAULT), (int)($in['id'] ?? 0)]);
    out([]);
}
case 'user_delete': {
    $me = admin(); $id = (int)($in['id'] ?? 0); if ($id === (int)$me['id']) fail('Das eigene Konto kann man nicht löschen');
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]); out([]);
}
case 'fachschaft_save': {
    admin(); $pdo = db(); $id = (int)($in['id'] ?? 0); $name = str($in, 'name', 60, true);
    try {
        $pdo->beginTransaction();
        if ($id) $pdo->prepare('UPDATE fachschaften SET name = ? WHERE id = ?')->execute([$name, $id]);
        else { $pdo->prepare('INSERT INTO fachschaften (name) VALUES (?)')->execute([$name]); $id = (int)$pdo->lastInsertId(); }
        if (isset($in['faecher'])) {
            $pdo->prepare('UPDATE faecher SET fachschaft_id = NULL WHERE fachschaft_id = ?')->execute([$id]);
            $st = $pdo->prepare('UPDATE faecher SET fachschaft_id = ? WHERE id = ?');
            foreach ((array)$in['faecher'] as $f) $st->execute([$id, (int)$f]);
        }
        $pdo->commit();
    } catch (PDOException $e) { $pdo->rollBack(); fail('Diese Fachschaft gibt es schon'); }
    out(['id' => $id]);
}
case 'fachschaft_delete': { admin(); db()->prepare('DELETE FROM fachschaften WHERE id = ?')->execute([(int)($in['id'] ?? 0)]); out([]); }
case 'fach_save': {
    admin(); $pdo = db(); $id = (int)($in['id'] ?? 0); $name = str($in, 'name', 60, true);
    try {
        if ($id) $pdo->prepare('UPDATE faecher SET name = ?, aktiv = ? WHERE id = ?')->execute([$name, !empty($in['aktiv']) ? 1 : 0, $id]);
        else { $pdo->prepare('INSERT INTO faecher (name, sort) VALUES (?, (SELECT COALESCE(MAX(sort), 0) + 10 FROM faecher))')->execute([$name]); $id = (int)$pdo->lastInsertId(); }
    } catch (PDOException $e) { fail('Dieses Fach gibt es schon'); }
    out(['id' => $id]);
}
case 'purge_exams': { // Schuljahresende: alle Prüfungen löschen (Konten, Fachschaften und Fächer bleiben)
    admin(); if (($in['confirm'] ?? '') !== 'LÖSCHEN') fail('Bitte LÖSCHEN eintippen');
    $sj = str($in, 'schuljahr', 9);
    $st = $sj ? db()->prepare('DELETE FROM exams WHERE schuljahr = ?') : db()->prepare('DELETE FROM exams');
    $st->execute($sj ? [$sj] : []); $n = $st->rowCount();
    db()->exec('VACUUM');
    out(['deleted' => $n]);
}
case 'security_check': { // liegt die Datenbank geschützt? (Die Oberfläche versucht zusätzlich, sie direkt abzurufen.)
    admin(); $d = realpath(data_dir()); $root = realpath(__DIR__);
    out(['inside_web' => str_starts_with((string)$d, (string)$root), 'htaccess' => is_file($d . '/.htaccess'), 'php' => PHP_VERSION, 'https' => $GLOBALS['https']]);
}

/* ---------- Prüfungen der Lehrkraft ---------- */
case 'my_faecher': { // Lehrkraft ergänzt oder ändert die eigenen Fächer
    $u = teacher(); set_user_faecher((int)$u['id'], (array)($in['faecher'] ?? []));
    out(['user' => ufields(user((int)$u['id']))]);
}
case 'catalog': {
    $u = teacher(); $pdo = db();
    $sj = $pdo->prepare('SELECT DISTINCT schuljahr FROM exams WHERE owner_id = ? ORDER BY schuljahr DESC'); $sj->execute([$uid]);
    $all = $pdo->query('SELECT id, name FROM faecher WHERE aktiv = 1 ORDER BY sort, name')->fetchAll();
    $mine = user_faecher((int)$u['id']);
    out(['faecher' => $mine ? array_values(array_filter($all, fn($f) => in_array((int)$f['id'], $mine, true))) : $all, 'eigene' => (bool)$mine, 'alle_faecher' => $all, 'arten' => ARTEN,
        'schuljahr' => schuljahr(), 'schuljahre' => array_values(array_unique(array_merge([schuljahr()], $sj->fetchAll(PDO::FETCH_COLUMN))))]);
}
case 'exam_list': {
    $u = teacher(); $st = db()->prepare('SELECT * FROM exams WHERE owner_id = ? AND schuljahr = ? ORDER BY klasse COLLATE NOCASE, datum, id');
    $st->execute([$u['id'], str($in, 'schuljahr', 9) ?: schuljahr()]);
    out(['exams' => array_map('exam_meta', $st->fetchAll())]);
}
case 'exam_get': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    out(['exam' => exam_meta($e) + ['draft_enc' => $e['draft_enc'], 'roster_enc' => $e['roster_enc']]]);
}
case 'exam_save': { // Rahmenbedingungen anlegen oder ändern
    $u = teacher(); $pdo = db(); $id = (int)($in['id'] ?? 0);
    $klasse = str($in, 'klasse', 20, true); $datum = str($in, 'datum', 10, true);
    if (!preg_match('~^\d{4}-\d{2}-\d{2}$~', $datum)) fail('Datum ungültig');
    $art = str($in, 'art', 30, true); if (!in_array($art, ARTEN, true)) fail('Art ungültig');
    $fid = (int)($in['fach_id'] ?? 0); $st = $pdo->prepare('SELECT name FROM faecher WHERE id = ?'); $st->execute([$fid]); $fach = $st->fetchColumn(); if (!$fach) fail('Fach ungültig');
    $skala = ($in['skala'] ?? '') === 'punkte' ? 'punkte' : 'noten';
    $v = [$klasse, $fid, $fach, $datum, $art, max(0, min(200, (int)($in['erwartet'] ?? 0))), max(0, min(600, (int)($in['dauer'] ?? 0))), !empty($in['pin_on']) ? 1 : 0, $skala, schuljahr($datum), time()];
    if ($id) { own_exam($u, $id); $pdo->prepare('UPDATE exams SET klasse=?, fach_id=?, fach=?, datum=?, art=?, erwartet=?, dauer=?, pin_on=?, skala=?, schuljahr=?, updated=? WHERE id=?')->execute([...$v, $id]); }
    else { $pdo->prepare('INSERT INTO exams (klasse, fach_id, fach, datum, art, erwartet, dauer, pin_on, skala, schuljahr, updated, owner_id, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([...$v, $u['id'], time()]); $id = (int)$pdo->lastInsertId(); }
    out(['exam' => exam_meta(own_exam($u, $id))]);
}
case 'exam_draft': { // Inhalt aus PathFinder: Entwurf (verschlüsselt), beim Fertigstellen auch Lösungsschlüssel und Schülerfassung
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    if ($e['status'] !== 'entwurf') fail('Die Prüfung wurde schon gestartet und lässt sich nicht mehr ändern', 409);
    $draft = blob($in, 'draft_enc'); if ($draft === null) fail('Inhalt fehlt');
    $f = ['draft_enc = ?', 'titel = ?', 'aufgaben = ?', 'punkte = ?', 'updated = ?'];
    $v = [$draft, str($in, 'titel', 200), max(0, (int)($in['aufgaben'] ?? 0)), max(0, (float)($in['punkte'] ?? 0)), time()];
    if (!empty($in['fertig'])) {
        $key = blob($in, 'key_enc'); $stud = blob($in, 'student_doc');
        if (!$key || !$stud || !is_array(json_decode($stud, true))) fail('Lösungsschlüssel oder Schülerfassung fehlt');
        array_push($f, 'key_enc = ?', 'student_doc = ?', 'fertig = 1'); array_push($v, $key, $stud);
    } else { $f[] = 'fertig = 0'; }
    db()->prepare('UPDATE exams SET ' . implode(', ', $f) . ' WHERE id = ?')->execute([...$v, $e['id']]);
    out(['exam' => exam_meta(own_exam($u, (int)$e['id']))]);
}
case 'exam_roster': { // Klassenliste (Vor- und Nachnamen) – verschlüsselt
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    $r = blob($in, 'roster_enc', 2_000_000); $n = max(0, min(500, (int)($in['roster_n'] ?? 0)));
    db()->prepare('UPDATE exams SET roster_enc = ?, roster_n = ?, erwartet = CASE WHEN ? > 0 THEN ? ELSE erwartet END, updated = ? WHERE id = ?')->execute([$r, $r ? $n : 0, $n, $n, time(), $e['id']]);
    out(['exam' => exam_meta(own_exam($u, (int)$e['id']))]);
}
case 'exam_delete': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    db()->prepare('DELETE FROM exams WHERE id = ?')->execute([$e['id']]); out([]);
}
default: fail('Unbekannte Aktion', 404);
}
