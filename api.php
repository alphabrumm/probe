<?php
// Probe – Schnittstelle für die Oberfläche. Aufruf: POST api.php mit JSON { "a": "aktion", … }.
// Der Server sieht nie Passwörter, Schülernamen, Antworten oder Lösungen im Klartext: Diese verschlüsselt der Browser.

declare(strict_types=1);
require __DIR__ . '/intern/db.php'; // nicht „lib“: manche Webspaces erlauben keinen Ordner dieses Namens

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

/* Notfall-Reset (z. B. Admin-Passwort verloren): Die Datei data/notfall.txt lässt sich nur per FTP anlegen
   (Workflow „Probe: Notfall-Reset“). Inhalt: „Nutzername Salz Login-Wert“ – „*“ statt Nutzername = erstes Admin-Konto.
   Probe setzt das Konto beim nächsten Aufruf auf dieses Startpasswort zurück, macht es zum Admin und löscht die Datei.
   Schlüssel und Prüfungen bleiben; mit dem Wiederherstellungscode bleiben sie lesbar. */
(function (): void {
    $d = data_dir(); $f = "$d/notfall.txt"; if (!is_file($f)) return;
    $p = preg_split('~\s+~', trim((string)file_get_contents($f))); @unlink($f);
    $log = fn(string $m) => file_put_contents("$d/notfall.log", date('Y-m-d H:i:s') . " $m\n", FILE_APPEND);
    if (count($p) !== 3 || !b64ok($p[1]) || !hexok($p[2])) { $log('ungültige Datei'); return; }
    $pdo = db();
    $st = $p[0] === '*' ? $pdo->query('SELECT id, kuerzel FROM users WHERE is_admin = 1 AND is_demo = 0 ORDER BY id LIMIT 1')
                        : $pdo->prepare('SELECT id, kuerzel FROM users WHERE kuerzel = ? AND is_demo = 0');
    if ($p[0] !== '*') $st->execute([$p[0]]);
    $u = $st->fetch(); if (!$u) { $log("Konto {$p[0]} nicht gefunden"); return; }
    $pdo->prepare('UPDATE users SET salt = ?, login_hash = ?, must_setup = 1, is_admin = 1 WHERE id = ?')->execute([$p[1], password_hash($p[2], PASSWORD_DEFAULT), $u['id']]);
    $pdo->prepare('DELETE FROM login_fails WHERE kuerzel = ?')->execute([mb_strtolower($u['kuerzel'])]);
    $log("Konto {$u['kuerzel']} auf Startpasswort zurückgesetzt");
})();

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
/** Adressen der Apps für Programmier-Aufgaben (JPad …); leer = Standard aus PathFinder (core/pfapp.js).
 *  Testinstanz: in config.local.php z. B. 'apps' => ['jpad' => 'https://alphabrumm.github.io/jpad/'] */
/**
 * Adressen der Apps für Programmier-Aufgaben (JPad …). In Prüfungen laufen sie in einem Unterordner von Probe selbst
 * (z. B. probe.pandapy.de/jpad/): Während der Prüfung muss dann nur die Probe-Domain frei sein. Die Prüfungsfassung
 * kommt mit dem Workflow der jeweiligen App dorthin (JPad: jpad-webspace.yml, Secret PROBE_FTP_DIR).
 * config 'apps' überschreibt einzelne Einträge (Testinstanz: JPad-Testfassung auf GitHub Pages).
 */
const APPS_DEFAULT = ['jpad' => 'jpad/'];
function apps_cfg(): ?array {
    $a = probe_config()['apps'] ?? []; if (!is_array($a)) $a = [];
    $o = []; foreach (array_merge(APPS_DEFAULT, $a) as $k => $v) if (is_string($k) && preg_match('~^[a-z]{2,12}$~', $k) && is_string($v)
        && preg_match('~^(https://|http://(localhost|127\.0\.0\.1)(:\d+)?/|/?[a-z0-9][a-z0-9_-]*/)[^\s"<>]*$~', $v)) $o[$k] = $v;
    return $o ?: null;
}
function ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }
function ufields(array $u): array {
    $fl = db()->prepare('SELECT f.id, f.name FROM fachleitungen l JOIN fachschaften f ON f.id = l.fachschaft_id WHERE l.user_id = ? ORDER BY f.name');
    $fl->execute([$u['id']]);
    return ['id' => (int)$u['id'], 'kuerzel' => $u['kuerzel'], 'name' => $u['name'], 'is_admin' => (bool)$u['is_admin'], 'must_setup' => (bool)$u['must_setup'],
        'has_keys' => (bool)$u['pub_key'], 'demo' => (bool)$u['demo'], 'is_demo' => (bool)$u['is_demo'], 'fachleitung' => $fl->fetchAll(), 'faecher' => user_faecher((int)$u['id'])];
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
        'fertig' => (bool)$e['fertig'], 'has_draft' => (bool)$e['draft_enc'], 'updated' => (int)$e['updated'],
        'code' => $e['code'], 'pin' => $e['pin'], 'join_open' => (bool)$e['join_open'], 'opened' => $e['opened'] ? (int)$e['opened'] : null,
        'ended' => $e['ended'] ? (int)$e['ended'] : null, 'expires' => $e['expires'] ? (int)$e['expires'] : null,
        'verlaengert' => (int)$e['verlaengert'], 'auto_abgabe' => (bool)$e['auto_abgabe'],
        'resp' => db()->query('SELECT status FROM respizienz WHERE exam_id = ' . (int)$e['id'] . ' ORDER BY id DESC LIMIT 1')->fetchColumn() ?: null,
        'teilnehmer' => (int)(db()->query('SELECT COUNT(*) FROM participants WHERE exam_id = ' . (int)$e['id'])->fetchColumn())];
}
const STATES = ['entwurf', 'offen', 'geschlossen', 'beendet', 'veroeffentlicht'];
function new_code(): string {
    $A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for ($t = 0; $t < 50; $t++) {
        $c = ''; for ($i = 0; $i < 8; $i++) $c .= $A[random_int(0, strlen($A) - 1)];
        $st = db()->prepare('SELECT 1 FROM exams WHERE code = ?'); $st->execute([$c]); if (!$st->fetchColumn()) return $c;
    }
    fail('Kein freier Prüfungscode');
}
function exam_by_code(string $code): array {
    $st = db()->prepare("SELECT * FROM exams WHERE code = ? AND status <> 'entwurf'"); $st->execute([strtoupper(trim($code))]);
    return $st->fetch() ?: fail('Diese Prüfung gibt es nicht (mehr). Prüfe den Link oder scanne den QR-Code erneut.', 404);
}
function participant(array $e, string $token): array {
    $st = db()->prepare('SELECT * FROM participants WHERE exam_id = ? AND token_hash = ?'); $st->execute([$e['id'], hash('sha256', $token)]);
    return $st->fetch() ?: fail('Diese Anmeldung gilt nicht mehr. Bitte melde dich bei deiner Lehrkraft.', 403);
}
function deadline(array $e, array $p): ?int { return (int)$e['dauer'] > 0 && $e['opened'] ? (int)$e['opened'] + ((int)$e['dauer'] + (int)$e['verlaengert'] + (int)$p['zuschlag']) * 60 : null; }
/** Nach dieser Zeit nimmt der Server nichts mehr an (2 Minuten Kulanz). Ohne automatische Abgabe: erst, wenn die Lehrkraft schließt oder beendet. */
function cutoff(array $e, array $p): ?int {
    $dl = deadline($e, $p); if (!$dl || !$e['auto_abgabe']) return null;
    return max($dl, (int)$e['auto_set']) + 120; // wird die automatische Abgabe nach Ablauf wieder eingeschaltet, zählt der Zeitpunkt des Einschaltens
}
/** Respizienz-Eintrag, auf den diese Fachleitung Zugriff hat (mit ihrem verschlüsselten Paket) */
function resp_for(array $u, int $rid): array {
    $st = db()->prepare('SELECT r.*, k.data_enc, s.name AS fachschaft, o.pub_key AS owner_pub FROM respizienz r JOIN respizienz_keys k ON k.resp_id = r.id AND k.user_id = ?
        LEFT JOIN fachschaften s ON s.id = r.fachschaft_id LEFT JOIN users o ON o.id = r.owner_id WHERE r.id = ?');
    $st->execute([$u['id'], $rid]); $r = $st->fetch(); if (!$r) fail('Nicht gefunden', 404); return $r;
}
/** Notizen zu einem Respizienz-Eintrag, je mit dem für $uid verschlüsselten Text (Lehrkraft: nur die für sie bestimmten) */
function resp_notes(int $rid, int $uid, bool $teacher): array {
    $st = db()->prepare('SELECT id, author_id, author, created, for_teacher, kind, enc FROM respizienz_notes WHERE resp_id = ? ORDER BY created, id'); $st->execute([$rid]); $out = [];
    foreach ($st->fetchAll() as $n) {
        if ($teacher && !(int)$n['for_teacher']) continue;
        $enc = json_decode($n['enc'], true); if (!isset($enc[(string)$uid])) continue;
        $out[] = ['id' => (int)$n['id'], 'author_id' => $n['author_id'] ? (int)$n['author_id'] : null, 'author' => $n['author'], 'created' => (int)$n['created'], 'for_teacher' => (bool)$n['for_teacher'], 'kind' => $n['kind'], 'enc' => $enc[(string)$uid]];
    }
    return $out;
}
function owner_pub(array $e): string { $st = db()->prepare('SELECT pub_key FROM users WHERE id = ?'); $st->execute([$e['owner_id']]); return (string)$st->fetchColumn(); }
function throttle(string $k, int $max, int $win = 600): void {
    $pdo = db(); $pdo->prepare('DELETE FROM join_fails WHERE t < ?')->execute([time() - $win]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM join_fails WHERE k = ? AND ip = ?'); $st->execute([$k, ip()]);
    if ((int)$st->fetchColumn() >= $max) fail('Zu viele Versuche – bitte ein paar Minuten warten.', 429);
}
const DEMO_TTL = 4 * 3600; // Demo-Konten mit allen Prüfungen nach 4 Stunden löschen
function demo_cleanup(): void { db()->prepare('DELETE FROM users WHERE is_demo = 1 AND created < ?')->execute([time() - DEMO_TTL]); }
function throttle_fail(string $k): void { db()->prepare('INSERT INTO join_fails (k, ip, t) VALUES (?,?,?)')->execute([$k, ip(), time()]); }
function student_state(array $e, array $p): array {
    return ['pid' => (int)$p['id'], 'status' => $p['status'], 'exam_status' => $e['status'], 'deadline' => deadline($e, $p), 'auto' => (bool)$e['auto_abgabe'], 'now' => time()];
}

/* ---------- Anmeldung und Schlüssel ---------- */
switch ($a) {
case 'status': {
    demo_cleanup(); $n = (int)db()->query('SELECT COUNT(*) FROM users WHERE is_demo = 0')->fetchColumn();
    $u = $uid ? user($uid) : null;
    if ($u && empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    $ro = 0; if ($u) { $q = db()->prepare("SELECT COUNT(*) FROM respizienz r JOIN respizienz_keys k ON k.resp_id = r.id AND k.user_id = ? WHERE r.status = 'eingereicht'"); $q->execute([$u['id']]); $ro = (int)$q->fetchColumn(); }
    out(['resp_open' => $ro, 'setup' => $n === 0, 'user' => $u ? ufields($u) : null, 'csrf' => $u ? $_SESSION['csrf'] : null, 'keys' => $u ? keys($u) : null,
        'https' => $GLOBALS['https']]);
}
case 'setup_admin': { // allererster Start: das erste Konto ist Admin, mit eigenem Passwort und Schlüsseln
    $pdo = db(); $pdo->beginTransaction();
    if ((int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_demo = 0')->fetchColumn() > 0) fail('Probe ist schon eingerichtet', 409);
    $k = str($in, 'kuerzel', 20, true); if (!preg_match('~^[\p{L}0-9._-]{2,20}$~u', $k)) fail('Nutzername: 2–20 Buchstaben, Ziffern oder . _ -');
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
        usleep(300000); fail('Nutzername oder Passwort stimmt nicht', 401);
    }
    $pdo->prepare('UPDATE users SET last_login = ? WHERE id = ?')->execute([time(), $u['id']]);
    session_regenerate_id(true); $_SESSION = ['uid' => (int)$u['id'], 'seen' => time(), 'csrf' => bin2hex(random_bytes(16))];
    out(['user' => ufields($u), 'csrf' => $_SESSION['csrf'], 'keys' => keys($u)]);
}
case 'logout': { $_SESSION = []; session_destroy(); out([]); }
case 'demo_start': { // Demo-Modus: vorübergehendes Konto, Schlüssel erzeugt der Browser; nach DEMO_TTL automatisch gelöscht
    $pdo = db(); demo_cleanup();
    throttle('demo', 40, 3600); throttle_fail('demo'); // eine Schule teilt sich oft eine IP – daher großzügig
    if ((int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_demo = 1')->fetchColumn() >= 80) fail('Gerade probieren sehr viele die Demo aus – bitte in ein paar Minuten noch einmal.', 429);
    $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true); $pub = str($in, 'pub_key', 400, true); $priv = str($in, 'priv_pw', 4000, true);
    if (!b64ok($salt) || !hexok($auth) || !b64ok($pub, 60) || strlen($priv) < 40) fail('Ungültige Schlüssel');
    for ($t = 0; $t < 20; $t++) {
        $A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; $k = 'DEMO-'; for ($i = 0; $i < 4; $i++) $k .= $A[random_int(0, strlen($A) - 1)];
        try {
            $pdo->prepare("INSERT INTO users (kuerzel, name, salt, login_hash, pub_key, priv_pw, must_setup, created, last_login, is_demo) VALUES (?, 'Demo-Lehrkraft', ?, ?, ?, ?, 0, ?, ?, 1)")
                ->execute([$k, $salt, password_hash($auth, PASSWORD_DEFAULT), $pub, $priv, time(), time()]);
            break;
        } catch (PDOException $e) { if ($t === 19) fail('Demo konnte nicht angelegt werden'); }
    }
    $id = (int)$pdo->lastInsertId();
    $f = $pdo->query("SELECT id FROM faecher WHERE name = 'Physik' COLLATE NOCASE")->fetchColumn(); if ($f) set_user_faecher($id, [(int)$f]);
    session_regenerate_id(true); $_SESSION = ['uid' => $id, 'seen' => time(), 'csrf' => bin2hex(random_bytes(16))];
    $u = user($id); out(['user' => ufields($u), 'csrf' => $_SESSION['csrf'], 'keys' => keys($u), 'ttl' => DEMO_TTL]);
}
case 'demo_end': {
    $u = teacher(); if (!$u['is_demo']) fail('Das ist kein Demo-Konto');
    db()->prepare('DELETE FROM users WHERE id = ? AND is_demo = 1')->execute([$u['id']]); // Prüfungen, Teilnehmer und Berichte werden mitgelöscht
    $_SESSION = []; session_destroy(); out([]);
}
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
        if ($u['pub_key']) { $pdo->prepare('DELETE FROM exams WHERE owner_id = ?')->execute([$u['id']]); $pdo->prepare('UPDATE users SET demo = 0 WHERE id = ?')->execute([$u['id']]); } // alte Daten sind ohne Schlüssel unlesbar; Beispiele neu anlegen
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
    $users = $pdo->query('SELECT id, kuerzel, name, is_admin, must_setup, pub_key IS NOT NULL AS has_keys, last_login FROM users WHERE is_demo = 0 ORDER BY kuerzel')->fetchAll();
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
    if (!preg_match('~^[\p{L}0-9._-]{2,20}$~u', $k)) fail('Nutzername: 2–20 Buchstaben, Ziffern oder . _ -');
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
    } catch (PDOException $e) { $pdo->rollBack(); fail(str_contains($e->getMessage(), 'UNIQUE') ? 'Diesen Nutzernamen gibt es schon' : 'Speichern fehlgeschlagen'); }
    out(['id' => $id]);
}
case 'user_reset': { // Startpasswort neu setzen; die Lehrkraft braucht danach ihren Wiederherstellungscode
    admin(); $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true); if (!b64ok($salt) || !hexok($auth)) fail('Ungültiges Startpasswort');
    db()->prepare('UPDATE users SET salt = ?, login_hash = ?, must_setup = 1 WHERE id = ?')->execute([$salt, password_hash($auth, PASSWORD_DEFAULT), (int)($in['id'] ?? 0)]);
    out([]);
}
case 'user_reset_many': { // mehrere Startpasswörter auf einmal (der Browser hat sie erzeugt und umgerechnet); das eigene Konto bleibt
    $me = admin(); $items = $in['items'] ?? null;
    if (!is_array($items) || !$items || count($items) > 500) fail('Keine Lehrkräfte ausgewählt');
    $pdo = db(); $pdo->beginTransaction(); $n = 0;
    $st = $pdo->prepare('UPDATE users SET salt = ?, login_hash = ?, must_setup = 1 WHERE id = ? AND is_demo = 0');
    foreach ($items as $it) {
        $id = (int)($it['id'] ?? 0); $salt = (string)($it['salt'] ?? ''); $auth = (string)($it['auth'] ?? '');
        if ($id === (int)$me['id']) continue;
        if (!b64ok($salt) || !hexok($auth)) { $pdo->rollBack(); fail('Ungültiges Startpasswort'); }
        $st->execute([$salt, password_hash($auth, PASSWORD_DEFAULT), $id]); $n += $st->rowCount();
    }
    $pdo->commit(); out(['reset' => $n]);
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
case 'fachschaften_auto': { // je angebotenem Fach ohne Fachschaft: Fachschaft gleichen Namens anlegen (oder vorhandene nutzen) und zuordnen
    admin(); $pdo = db(); $created = 0; $assigned = 0;
    $pdo->beginTransaction();
    $find = $pdo->prepare('SELECT id FROM fachschaften WHERE name = ?'); $ins = $pdo->prepare('INSERT INTO fachschaften (name) VALUES (?)'); $set = $pdo->prepare('UPDATE faecher SET fachschaft_id = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, name FROM faecher WHERE aktiv = 1 AND fachschaft_id IS NULL ORDER BY sort, name')->fetchAll() as $f) {
        $find->execute([$f['name']]); $id = (int)$find->fetchColumn();
        if (!$id) { $ins->execute([$f['name']]); $id = (int)$pdo->lastInsertId(); $created++; }
        $set->execute([$id, $f['id']]); $assigned++;
    }
    $pdo->commit(); out(['created' => $created, 'assigned' => $assigned]);
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
    ($sj ? db()->prepare('DELETE FROM respizienz WHERE schuljahr = ?') : db()->prepare('DELETE FROM respizienz'))->execute($sj ? [$sj] : []); // Respizienz-Kopien gehören dazu
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
case 'demo_seed': { // Beispielprüfungen: „7d“ geschrieben und zur Korrektur bereit, „7p“ fertig vorbereitet (Inhalte im Browser verschlüsselt)
    $u = teacher(); $pdo = db();
    $X = $in['exams'] ?? null; if (!is_array($X) || count($X) !== 2) fail('Ungültige Beispieldaten');
    $pdo->beginTransaction();
    $st = $pdo->prepare('UPDATE users SET demo = 1 WHERE id = ?' . (empty($in['force']) ? ' AND demo = 0' : '')); $st->execute([$u['id']]);
    if (!$st->rowCount()) { $pdo->rollBack(); out(['skipped' => true]); }
    $f = $pdo->query("SELECT id, name FROM faecher WHERE name = 'Physik' COLLATE NOCASE")->fetch();
    $sj = schuljahr(); $day = fn(int $d) => schuljahr(date('Y-m-d', time() + $d * 86400)) === $sj ? date('Y-m-d', time() + $d * 86400) : date('Y-m-d');
    $res = [];
    foreach ($X as $x) {
        $done = !empty($x['done']); $datum = $day($done ? -7 : 7); $now = time();
        $opened = strtotime($datum . ' 08:05'); if ($opened > $now) $opened = $now - 3600;
        $parts = $done ? (array)($x['participants'] ?? []) : []; if (count($parts) > 40) fail('Zu viele Teilnehmer');
        $pdo->prepare("INSERT INTO exams (owner_id, schuljahr, klasse, fach_id, fach, datum, art, titel, erwartet, dauer, pin_on, skala, status, draft_enc, key_enc, student_doc, roster_enc, roster_n,
            aufgaben, punkte, fertig, created, updated, code, pin, join_open, opened, ended) VALUES (?,?,?,?,?,?,?,?,?,?,1,'noten',?,?,?,?,?,?,?,?,1,?,?,?,?,0,?,?)")
            ->execute([$u['id'], schuljahr($datum), str($x, 'klasse', 20, true), $f ? (int)$f['id'] : null, $f ? $f['name'] : 'Physik', $datum, 'Kurzarbeit', str($x, 'titel', 200),
                max(0, min(200, (int)($x['roster_n'] ?? 0))), max(0, min(600, (int)($x['dauer'] ?? 20))), $done ? 'beendet' : 'entwurf',
                str($x, 'draft_enc', 2_000_000, true), str($x, 'key_enc', 2_000_000, true), str($x, 'student_doc', 2_000_000, true), blob($x, 'roster_enc', 2_000_000), max(0, min(500, (int)($x['roster_n'] ?? 0))),
                max(0, (int)($x['aufgaben'] ?? 0)), max(0, (float)($x['punkte'] ?? 0)), $now, $now, $done ? new_code() : null, $done ? str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT) : '',
                $done ? $opened : null, $done ? $opened + 20 * 60 : null]);
        $eid = (int)$pdo->lastInsertId(); $pids = [];
        $ins = $pdo->prepare("INSERT INTO participants (exam_id, token_hash, identity_enc, status, joined, last_seen, saved, n_saves, fokus, answers_enc) VALUES (?,?,?,'abgegeben',?,?,?,?,?,?)");
        foreach ($parts as $p) {
            $t = $opened + max(1, min(20, (int)($p['minute'] ?? 15))) * 60;
            $ins->execute([$eid, hash('sha256', random_bytes(32)), str($p, 'identity_enc', 4000, true), $opened + 30, $t, $t, 6, max(0, (int)($p['fokus'] ?? 0)), str($p, 'answers_enc', 200_000, true)]);
            $pids[] = (int)$pdo->lastInsertId();
        }
        $res[] = ['klasse' => $x['klasse'], 'id' => $eid, 'pids' => $pids];
    }
    $pdo->commit();
    out(['exams' => $res]);
}
/* ---------- Respizienz: Lehrkraft reicht ein, Fachleitung sieht durch und zeichnet ab ---------- */
case 'resp_targets': { // Lehrkraft: Fachschaft, Fachleitung(en) und Stand der Respizienz dieser Prüfung (mit den Notizen für sie)
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0)); $pdo = db();
    if ($u['is_demo']) out(['demo' => true, 'fachschaft' => null, 'to' => [], 'last' => null, 'notes' => []]); // Demo-Prüfungen gehen nie an echte Fachleitungen
    $st = $pdo->prepare('SELECT s.id, s.name FROM faecher f JOIN fachschaften s ON s.id = f.fachschaft_id WHERE f.id = ? OR (? IS NULL AND f.name = ? COLLATE NOCASE) LIMIT 1');
    $st->execute([$e['fach_id'], $e['fach_id'], $e['fach']]); $fs = $st->fetch();
    $to = [];
    if ($fs) { $st = $pdo->prepare('SELECT u.id, u.kuerzel, u.name, u.pub_key FROM fachleitungen l JOIN users u ON u.id = l.user_id WHERE l.fachschaft_id = ? AND u.id <> ? AND u.pub_key IS NOT NULL AND u.must_setup = 0 AND u.is_demo = 0 ORDER BY u.kuerzel');
        $st->execute([$fs['id'], $u['id']]); $to = $st->fetchAll(); }
    $r = $pdo->prepare('SELECT id, created, updated, status, seen, signed, signer, rueck, note_enc FROM respizienz WHERE exam_id = ? ORDER BY id DESC LIMIT 1'); $r->execute([$e['id']]);
    $last = $r->fetch() ?: null;
    out(['fachschaft' => $fs ?: null, 'to' => $to, 'last' => $last, 'notes' => $last ? resp_notes((int)$last['id'], (int)$u['id'], true) : []]);
}
case 'resp_submit': { // einreichen; erneutes Einreichen ersetzt die Fassung, behält aber Notizen und Verlauf
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0)); $pdo = db();
    if (!in_array($e['status'], ['beendet', 'veroeffentlicht'], true)) fail('Erst die Prüfung beenden und korrigieren.');
    if ($u['is_demo']) fail('Im Demo-Modus geht keine Prüfung an die Fachleitung.');
    $fsid = (int)($in['fachschaft_id'] ?? 0); $items = $in['items'] ?? null; if (!is_array($items) || !$items) fail('Keine Fachleitung als Empfänger');
    $ok = $pdo->prepare('SELECT 1 FROM fachleitungen l JOIN users u ON u.id = l.user_id WHERE l.fachschaft_id = ? AND l.user_id = ? AND u.pub_key IS NOT NULL');
    foreach ($items as $it) { $ok->execute([$fsid, (int)($it['user_id'] ?? 0)]); if (!$ok->fetchColumn()) fail('Empfänger ist keine Fachleitung dieser Fachschaft'); }
    $who = trim(($u['name'] ? $u['name'] . ' ' : '') . '(' . $u['kuerzel'] . ')'); $n = max(0, (int)($in['teilnehmer'] ?? 0)); $now = time();
    $pdo->beginTransaction();
    $st = $pdo->prepare('SELECT id FROM respizienz WHERE exam_id = ? ORDER BY id DESC LIMIT 1'); $st->execute([$e['id']]); $rid = (int)$st->fetchColumn();
    if ($rid) {
        $pdo->prepare("UPDATE respizienz SET owner_id = ?, lehrkraft = ?, fachschaft_id = ?, schuljahr = ?, klasse = ?, fach = ?, art = ?, datum = ?, titel = ?, teilnehmer = ?, updated = ?,
            status = 'eingereicht', seen = NULL, signed = NULL, signer_id = NULL, signer = '' WHERE id = ?")
            ->execute([$u['id'], $who, $fsid, $e['schuljahr'], $e['klasse'], $e['fach'], $e['art'], $e['datum'], $e['titel'], $n, $now, $rid]);
        $pdo->prepare('DELETE FROM respizienz_keys WHERE resp_id = ?')->execute([$rid]);
    } else {
        $pdo->prepare('INSERT INTO respizienz (exam_id, owner_id, lehrkraft, fachschaft_id, schuljahr, klasse, fach, art, datum, titel, teilnehmer, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$e['id'], $u['id'], $who, $fsid, $e['schuljahr'], $e['klasse'], $e['fach'], $e['art'], $e['datum'], $e['titel'], $n, $now, $now]);
        $rid = (int)$pdo->lastInsertId();
    }
    $ins = $pdo->prepare('INSERT INTO respizienz_keys (resp_id, user_id, data_enc) VALUES (?,?,?)');
    foreach ($items as $it) $ins->execute([$rid, (int)$it['user_id'], str($it, 'data_enc', 20_000_000, true)]);
    $pdo->commit(); out(['id' => $rid]);
}
case 'resp_list': { // Fachleitung: alle eingereichten Prüfungen ihrer Fachschaften
    $u = teacher();
    $st = db()->prepare('SELECT r.id, r.lehrkraft, r.schuljahr, r.klasse, r.fach, r.art, r.datum, r.titel, r.teilnehmer, r.created, r.updated, r.status, r.seen, r.signed, r.signer, r.rueck, s.name AS fachschaft,
        (SELECT COUNT(*) FROM respizienz_notes n WHERE n.resp_id = r.id) AS notes
        FROM respizienz r JOIN respizienz_keys k ON k.resp_id = r.id AND k.user_id = ? LEFT JOIN fachschaften s ON s.id = r.fachschaft_id ORDER BY COALESCE(r.updated, r.created) DESC');
    $st->execute([$u['id']]); out(['items' => $st->fetchAll()]);
}
case 'resp_get': { // Fachleitung: Paket, Notizen, Empfänger für neue Notizen; peek = ohne „gesehen“ zu setzen (Archiv-Export)
    $u = teacher(); $pdo = db(); $r = resp_for($u, (int)($in['rid'] ?? 0));
    if ($r['status'] === 'eingereicht' && empty($in['peek'])) { $pdo->prepare("UPDATE respizienz SET status = 'gesehen', seen = ? WHERE id = ?")->execute([time(), $r['id']]); $r['status'] = 'gesehen'; $r['seen'] = time(); }
    $st = $pdo->prepare('SELECT u.id, u.kuerzel, u.name, u.pub_key FROM respizienz_keys k JOIN users u ON u.id = k.user_id WHERE k.resp_id = ? AND u.pub_key IS NOT NULL'); $st->execute([$r['id']]);
    $q = $pdo->prepare("SELECT COUNT(*) FROM respizienz r JOIN respizienz_keys k ON k.resp_id = r.id AND k.user_id = ? WHERE r.status = 'eingereicht'"); $q->execute([$u['id']]);
    out(['item' => $r, 'notes' => resp_notes((int)$r['id'], (int)$u['id'], false), 'fl' => $st->fetchAll(), 'open' => (int)$q->fetchColumn()]);
}
case 'resp_note': { // Fachleitung: Notiz (intern oder für die Lehrkraft), optional zugleich Rückfrage oder Abzeichnen
    $u = teacher(); $pdo = db(); $r = resp_for($u, (int)($in['rid'] ?? 0));
    $kind = in_array($in['kind'] ?? '', ['notiz', 'rueckfrage', 'abgezeichnet'], true) ? $in['kind'] : 'notiz';
    $forT = $kind === 'rueckfrage' ? 1 : (!empty($in['for_teacher']) ? 1 : 0);
    $enc = $in['enc'] ?? null;
    if ($enc !== null) { // Empfänger: Fachleitungen dieser Prüfung, bei „für die Lehrkraft“ zusätzlich die Lehrkraft
        if (!is_array($enc) || !$enc) fail('Notiz fehlt');
        $st = $pdo->prepare('SELECT user_id FROM respizienz_keys WHERE resp_id = ?'); $st->execute([$r['id']]); $allowed = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        if ($forT && $r['owner_id']) $allowed[] = (int)$r['owner_id'];
        foreach ($enc as $uid => $v) { if (!in_array((int)$uid, $allowed, true) || !is_string($v) || strlen($v) > 200_000) fail('Ungültiger Empfänger'); }
        if (!isset($enc[(string)$u['id']]) && !isset($enc[(int)$u['id']])) fail('Die Notiz muss auch für dich verschlüsselt sein');
    } elseif ($kind === 'rueckfrage') fail('Bitte schreib der Lehrkraft, was zu ändern ist.');
    $who = trim(($u['name'] ? $u['name'] . ' ' : '') . '(' . $u['kuerzel'] . ')'); $now = time();
    $pdo->beginTransaction();
    if ($enc !== null) $pdo->prepare('INSERT INTO respizienz_notes (resp_id, author_id, author, created, for_teacher, kind, enc) VALUES (?,?,?,?,?,?,?)')
        ->execute([$r['id'], $u['id'], $who, $now, $forT, $kind, json_encode($enc)]);
    if ($kind === 'rueckfrage') $pdo->prepare("UPDATE respizienz SET status = 'rueckfrage', rueck = ?, signed = NULL, signer_id = NULL, signer = '' WHERE id = ?")->execute([$now, $r['id']]);
    if ($kind === 'abgezeichnet') $pdo->prepare("UPDATE respizienz SET status = 'abgezeichnet', signed = ?, signer_id = ?, signer = ? WHERE id = ?")->execute([$now, $u['id'], $who, $r['id']]);
    $pdo->commit(); out([]);
}
case 'resp_note_delete': { // eigene Notiz löschen (Rückfragen und Abzeichnungen bleiben als Verlauf)
    $u = teacher(); $r = resp_for($u, (int)($in['rid'] ?? 0));
    db()->prepare("DELETE FROM respizienz_notes WHERE id = ? AND resp_id = ? AND author_id = ? AND kind = 'notiz'")->execute([(int)($in['nid'] ?? 0), $r['id'], $u['id']]); out([]);
}
case 'resp_reopen': { // Abzeichnung zurücknehmen
    $u = teacher(); $r = resp_for($u, (int)($in['rid'] ?? 0));
    db()->prepare("UPDATE respizienz SET status = 'gesehen', signed = NULL, signer_id = NULL, signer = '' WHERE id = ?")->execute([$r['id']]); out([]);
}
case 'archive_recipients': { // öffentliche Schlüssel der Admins: Archive lassen sich auch mit dem Admin-Schlüssel öffnen
    teacher();
    out(['admins' => db()->query('SELECT id, kuerzel, name, pub_key FROM users WHERE is_admin = 1 AND is_demo = 0 AND must_setup = 0 AND pub_key IS NOT NULL ORDER BY kuerzel')->fetchAll()]);
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
case 'exam_delete': { // endgültig: Inhalt, Abgaben, Bewertung, Ergebnisseiten, Kommentare (Respizienz-Fassung der Fachleitung bleibt)
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    if (in_array($e['status'], ['offen', 'geschlossen'], true)) fail('Die Prüfung läuft noch – bitte zuerst beenden.', 409);
    $pdo = db(); $pdo->exec('PRAGMA secure_delete = ON'); // gelöschte Daten in der Datei mit Nullen überschreiben
    $pdo->prepare('DELETE FROM exams WHERE id = ?')->execute([$e['id']]);
    try { $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (Throwable $x) { }
    out([]);
}
/* ---------- Schüler: ohne Konto, mit Prüfungscode und Gerätetoken ---------- */
case 'cfg': { // öffentliche Einstellungen für die Oberfläche
    out(['apps' => apps_cfg()]);
}
case 'p_info': {
    $e = exam_by_code(str($in, 'code', 12, true));
    out(['exam' => ['status' => $e['status'], 'titel' => $e['titel'], 'fach' => $e['fach'], 'klasse' => $e['klasse'], 'art' => $e['art'], 'datum' => $e['datum'],
        'dauer' => (int)$e['dauer'], 'pin_on' => (bool)$e['pin_on'], 'join_open' => (bool)$e['join_open']], 'pub_key' => owner_pub($e), 'now' => time()]);
}
case 'p_join': {
    $code = strtoupper(str($in, 'code', 12, true)); throttle('j:' . $code, 15);
    $e = exam_by_code($code);
    if ($e['status'] !== 'offen') fail($e['status'] === 'geschlossen' ? 'Die Prüfung ist gerade geschlossen.' : 'Die Prüfung ist nicht geöffnet.', 409);
    if (!$e['join_open']) fail('Der Einlass ist geschlossen. Bitte melde dich bei deiner Lehrkraft.', 409);
    if ($e['pin_on'] && !hash_equals((string)$e['pin'], preg_replace('~\D~', '', (string)($in['pin'] ?? '')))) { throttle_fail('j:' . $code); usleep(400000); fail('Die PIN stimmt nicht.', 401); }
    $id = str($in, 'identity_enc', 4000, true);
    $token = bin2hex(random_bytes(24));
    db()->prepare('INSERT INTO participants (exam_id, token_hash, identity_enc, joined, last_seen) VALUES (?,?,?,?,?)')->execute([$e['id'], hash('sha256', $token), $id, time(), time()]);
    $p = participant($e, $token);
    out(['token' => $token, 'doc' => json_decode((string)$e['student_doc'], true), 'pub_key' => owner_pub($e), 'apps' => apps_cfg()] + student_state($e, $p));
}
case 'p_resume': {
    $e = exam_by_code(str($in, 'code', 12, true)); $p = participant($e, str($in, 'token', 64, true));
    db()->prepare('UPDATE participants SET last_seen = ? WHERE id = ?')->execute([time(), $p['id']]);
    out(['doc' => json_decode((string)$e['student_doc'], true), 'pub_key' => owner_pub($e), 'apps' => apps_cfg()] + student_state($e, $p));
}
case 'p_save': { // Zwischenstand oder Abgabe (Antworten verschlüsselt für die Lehrkraft)
    $e = exam_by_code(str($in, 'code', 12, true)); $p = participant($e, str($in, 'token', 64, true));
    $final = !empty($in['final']); $ans = blob($in, 'answers_enc', 5_000_000);
    if ($p['status'] === 'abgegeben') fail('Schon abgegeben', 409);
    if ($e['status'] !== 'offen') { out(['saved' => false] + student_state($e, $p)); }
    $co = cutoff($e, $p);
    if ($co && time() > $co) { db()->prepare("UPDATE participants SET status = 'abgegeben', last_seen = ? WHERE id = ?")->execute([time(), $p['id']]); $p = participant($e, (string)$in['token']); out(['saved' => false, 'late' => true] + student_state($e, $p)); }
    db()->prepare('UPDATE participants SET answers_enc = COALESCE(?, answers_enc), saved = ?, last_seen = ?, n_saves = n_saves + 1, fokus = MAX(fokus, ?), status = ? WHERE id = ?')
        ->execute([$ans, time(), time(), max(0, (int)($in['fokus'] ?? 0)), $final ? 'abgegeben' : 'aktiv', $p['id']]);
    $p = participant($e, (string)$in['token']);
    out(['saved' => true] + student_state($e, $p));
}
case 'p_ping': {
    $e = exam_by_code(str($in, 'code', 12, true)); $p = participant($e, str($in, 'token', 64, true));
    db()->prepare('UPDATE participants SET last_seen = ?, fokus = MAX(fokus, ?) WHERE id = ?')->execute([time(), max(0, (int)($in['fokus'] ?? 0)), $p['id']]);
    out(student_state($e, $p));
}

/* ---------- Ergebnisseite der Schüler (Bericht verschlüsselt mit dem Ergebniscode) ---------- */
case 'r_get': {
    $rid = str($in, 'rid', 64, true); throttle('r', 40);
    db()->prepare('DELETE FROM reports WHERE expires < ?')->execute([time()]);
    $st = db()->prepare('SELECT report_enc, expires FROM reports WHERE rid = ?'); $st->execute([$rid]); $r = $st->fetch();
    if (!$r) { throttle_fail('r'); usleep(300000); fail('Zu diesem Code gibt es (noch) kein Ergebnis. Vielleicht ist die Korrektur noch nicht fertig – oder die Ergebnisseite ist schon abgelaufen.', 404); }
    out(['report_enc' => $r['report_enc'], 'expires' => (int)$r['expires']]);
}
case 'r_comment': {
    $rid = str($in, 'rid', 64, true); $c = str($in, 'comment_enc', 20000, true);
    $st = db()->prepare('SELECT exam_id FROM reports WHERE rid = ? AND expires >= ?'); $st->execute([$rid, time()]); $ex = $st->fetchColumn();
    if (!$ex) fail('Die Ergebnisseite ist abgelaufen.', 404);
    $st = db()->prepare('SELECT COUNT(*) FROM report_comments WHERE rid = ?'); $st->execute([$rid]); if ((int)$st->fetchColumn() >= 30) fail('Zu viele Kommentare');
    db()->prepare('INSERT INTO report_comments (exam_id, rid, comment_enc, created) VALUES (?,?,?,?)')->execute([$ex, $rid, $c, time()]);
    out([]);
}

/* ---------- Lehrkraft: Durchführung ---------- */
case 'exam_state': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0)); $to = (string)($in['to'] ?? ''); $from = $e['status']; $pdo = db();
    if (!in_array($to, STATES, true)) fail('Unbekannter Zustand');
    $n = (int)$pdo->query('SELECT COUNT(*) FROM participants WHERE exam_id = ' . (int)$e['id'])->fetchColumn();
    $ok = match ([$from, $to]) {
        ['entwurf', 'offen'] => (bool)$e['fertig'] ?: fail('Bitte zuerst den Inhalt fertigstellen („✓ Fertig“ im Editor).'),
        ['offen', 'geschlossen'], ['geschlossen', 'offen'], ['offen', 'beendet'], ['geschlossen', 'beendet'], ['veroeffentlicht', 'beendet'] => true,
        ['offen', 'entwurf'], ['geschlossen', 'entwurf'] => $n === 0 ?: fail('Es haben schon Schüler teilgenommen – zurück zum Entwurf geht nicht mehr.'),
        default => fail("Von „{$from}“ nach „{$to}“ geht nicht."),
    };
    if ($to === 'offen' && $from === 'entwurf') {
        $pdo->prepare('UPDATE exams SET status = ?, code = COALESCE(code, ?), pin = ?, join_open = 1, opened = ?, closed = NULL, ended = NULL, verlaengert = 0 WHERE id = ?')
            ->execute(['offen', new_code(), $e['pin_on'] ? str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT) : '', time(), $e['id']]);
    } elseif ($to === 'entwurf') {
        $pdo->prepare("UPDATE exams SET status = 'entwurf', opened = NULL WHERE id = ?")->execute([$e['id']]);
    } elseif ($to === 'beendet' && $from === 'veroeffentlicht') {
        $pdo->prepare("DELETE FROM reports WHERE exam_id = ?")->execute([$e['id']]);
        $pdo->prepare("UPDATE exams SET status = 'beendet', published = NULL, expires = NULL WHERE id = ?")->execute([$e['id']]);
    } else {
        $col = ['geschlossen' => 'closed', 'beendet' => 'ended', 'offen' => 'closed'][$to];
        $pdo->prepare("UPDATE exams SET status = ?, {$col} = ? WHERE id = ?")->execute([$to, $to === 'offen' ? null : time(), $e['id']]);
        if ($to === 'beendet') $pdo->prepare("UPDATE participants SET status = 'abgegeben' WHERE exam_id = ?")->execute([$e['id']]); // offene Arbeiten zählen mit dem letzten Stand
    }
    out(['exam' => exam_meta(own_exam($u, (int)$e['id']))]);
}
case 'exam_live': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    $st = db()->prepare('SELECT id, identity_enc, status, joined, last_seen, saved, n_saves, zuschlag, fokus, imported, answers_enc IS NOT NULL AS has_answers FROM participants WHERE exam_id = ? ORDER BY id');
    $st->execute([$e['id']]);
    out(['exam' => exam_meta($e), 'now' => time(), 'participants' => $st->fetchAll()]);
}
case 'exam_join_open': { $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0)); db()->prepare('UPDATE exams SET join_open = ? WHERE id = ?')->execute([!empty($in['open']) ? 1 : 0, $e['id']]); out([]); }
case 'exam_verlaengern': { // Zeit für alle verlängern (delta) oder zurücksetzen (set)
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    if (!in_array($e['status'], ['offen', 'geschlossen'], true)) fail('Die Prüfung läuft nicht.');
    $m = isset($in['set']) ? (int)$in['set'] : (int)$e['verlaengert'] + (int)($in['delta'] ?? 0);
    db()->prepare('UPDATE exams SET verlaengert = ? WHERE id = ?')->execute([max(0, min(240, $m)), $e['id']]);
    out(['exam' => exam_meta(own_exam($u, (int)$e['id']))]);
}
case 'exam_auto': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0)); $on = !empty($in['on']);
    db()->prepare('UPDATE exams SET auto_abgabe = ?, auto_set = ? WHERE id = ?')->execute([$on ? 1 : 0, $on ? time() : $e['auto_set'], $e['id']]);
    out(['exam' => exam_meta(own_exam($u, (int)$e['id']))]);
}
case 'exam_zuschlag': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    db()->prepare('UPDATE participants SET zuschlag = ? WHERE id = ? AND exam_id = ?')->execute([max(0, min(240, (int)($in['minutes'] ?? 0))), (int)($in['pid'] ?? 0), $e['id']]); out([]);
}
case 'exam_participant_delete': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    db()->prepare('DELETE FROM participants WHERE id = ? AND exam_id = ?')->execute([(int)($in['pid'] ?? 0), $e['id']]); out([]);
}
case 'exam_import': { // Notfall: Abgabe per Datei (AirDrop) – die Lehrkraft entscheidet
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0)); $pid = (int)($in['pid'] ?? 0);
    $ans = str($in, 'answers_enc', 5_000_000, true); $idn = str($in, 'identity_enc', 4000, true);
    $st = db()->prepare('SELECT id FROM participants WHERE id = ? AND exam_id = ?'); $st->execute([$pid, $e['id']]);
    if ($st->fetchColumn()) db()->prepare("UPDATE participants SET answers_enc = ?, imported = 1, status = 'abgegeben', saved = ? WHERE id = ?")->execute([$ans, time(), $pid]);
    else db()->prepare("INSERT INTO participants (exam_id, token_hash, identity_enc, status, joined, last_seen, saved, imported, answers_enc) VALUES (?,?,?,'abgegeben',?,?,?,1,?)")
        ->execute([$e['id'], hash('sha256', bin2hex(random_bytes(24))), $idn, time(), time(), time(), $ans]);
    out([]);
}

/* ---------- Lehrkraft: Auswertung ---------- */
case 'exam_results': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    $p = db()->prepare('SELECT id, identity_enc, answers_enc, status, saved, fokus, zuschlag, imported FROM participants WHERE exam_id = ? ORDER BY id'); $p->execute([$e['id']]);
    $c = db()->prepare('SELECT id, rid, comment_enc, created, gelesen FROM report_comments WHERE exam_id = ? ORDER BY id'); $c->execute([$e['id']]);
    out(['exam' => exam_meta($e), 'key_enc' => $e['key_enc'], 'grading_enc' => $e['grading_enc'], 'participants' => $p->fetchAll(), 'comments' => $c->fetchAll()]);
}
case 'exam_grading': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    db()->prepare('UPDATE exams SET grading_enc = ?, updated = ? WHERE id = ?')->execute([str($in, 'grading_enc', 5_000_000, true), time(), $e['id']]); out([]);
}
case 'exam_publish': { // Ergebnisse veröffentlichen (Quittieren): Berichte je Schüler, verschlüsselt mit dessen Ergebniscode
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    if (!in_array($e['status'], ['beendet', 'veroeffentlicht'], true)) fail('Erst die Prüfung beenden.');
    $days = max(1, min(90, (int)($in['days'] ?? 14))); $exp = strtotime('tomorrow', time()) + ($days - 1) * 86400 + 86399;
    $pdo = db(); $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM reports WHERE exam_id = ?')->execute([$e['id']]);
    $st = $pdo->prepare('INSERT OR REPLACE INTO reports (rid, exam_id, report_enc, expires) VALUES (?,?,?,?)');
    foreach ((array)($in['reports'] ?? []) as $r) {
        $rid = (string)($r['rid'] ?? ''); if (!preg_match('~^[0-9a-f]{32,64}$~', $rid)) continue;
        $st->execute([$rid, $e['id'], substr((string)($r['report_enc'] ?? ''), 0, 2_000_000), $exp]);
    }
    $pdo->prepare("UPDATE exams SET status = 'veroeffentlicht', published = ?, expires = ? WHERE id = ?")->execute([time(), $exp, $e['id']]);
    $pdo->commit();
    out(['exam' => exam_meta(own_exam($u, (int)$e['id']))]);
}
case 'comment_read': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    db()->prepare('UPDATE report_comments SET gelesen = 1 WHERE id = ? AND exam_id = ?')->execute([(int)($in['cid'] ?? 0), $e['id']]); out([]);
}
default: fail('Unbekannte Aktion', 404);
}
