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
function apps_cfg(): ?array {
    $a = probe_config()['apps'] ?? null; if (!is_array($a)) return null;
    $o = []; foreach ($a as $k => $v) if (is_string($k) && preg_match('~^[a-z]{2,12}$~', $k) && is_string($v) && preg_match('~^(https://|http://(localhost|127\.0\.0\.1)(:\d+)?/)[^\s"<>]*$~', $v)) $o[$k] = $v;
    return $o ?: null;
}
function ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }
function ufields(array $u): array {
    $fl = db()->prepare('SELECT f.id, f.name FROM fachleitungen l JOIN fachschaften f ON f.id = l.fachschaft_id WHERE l.user_id = ? ORDER BY f.name');
    $fl->execute([$u['id']]);
    return ['id' => (int)$u['id'], 'kuerzel' => $u['kuerzel'], 'name' => $u['name'], 'is_admin' => (bool)$u['is_admin'], 'must_setup' => (bool)$u['must_setup'],
        'has_keys' => (bool)$u['pub_key'], 'demo' => (bool)$u['demo'], 'is_demo' => (bool)$u['is_demo'], 'is_berater' => (bool)($u['is_berater'] ?? 0), 'fachleitung' => $fl->fetchAll(), 'faecher' => user_faecher((int)$u['id']), 'prefs' => prefs_of($u)];
}
const PREFS = ['pathfinder', 'notizen', 'umfragen', 'planpad']; // alle zunächst aus: Neue sehen nur Prüfungen und Coaching
const THEMES = ['blau', 'nacht', 'weiss', 'gold', 'gelb', 'sepia', 'bunt']; // Farbschemata (app/themes/; bunt = app/icon.svg), Standard: blau
function prefs_of(array $u): array { $p = json_decode((string)($u['prefs'] ?? ''), true) ?: []; $o = []; foreach (PREFS as $k) $o[$k] = !empty($p[$k]); $o['theme'] = in_array($p['theme'] ?? '', THEMES, true) ? $p['theme'] : 'blau'; return $o; }
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
        'verlaengert' => (int)$e['verlaengert'], 'auto_abgabe' => (bool)$e['auto_abgabe'], 'pqr' => (bool)($e['pqr'] ?? 0), 'class_id' => $e['class_id'] ? (int)$e['class_id'] : null,
        'resp' => db()->query('SELECT status FROM respizienz WHERE exam_id = ' . (int)$e['id'] . ' ORDER BY id DESC LIMIT 1')->fetchColumn() ?: null,
        'teilnehmer' => (int)(db()->query('SELECT COUNT(*) FROM participants WHERE exam_id = ' . (int)$e['id'])->fetchColumn())];
}
/* Klassen */
function own_class(array $u, int $id): array { $st = db()->prepare('SELECT * FROM classes WHERE id = ? AND owner_id = ?'); $st->execute([$id, $u['id']]); return $st->fetch() ?: fail('Klasse nicht gefunden', 404); }
/** passende Klasse zu Klassenname + Fach im Schuljahr: zuerst mit gleichem Fach, sonst eine Klasse ohne Fach */
function class_for(array $u, string $sj, string $klasse, int $fid): ?array {
    $st = db()->prepare('SELECT * FROM classes WHERE owner_id = ? AND schuljahr = ? AND name = ? COLLATE NOCASE AND (fach_id = ? OR fach_id IS NULL) ORDER BY (fach_id IS NULL), id LIMIT 1');
    $st->execute([$u['id'], $sj, trim($klasse), $fid]); return $st->fetch() ?: null;
}
/** Jede Prüfung gehört zu einer Klasse (Name + Fach im Schuljahr): fehlt sie, wird sie angelegt – mit der Namensliste der Prüfung, falls die Klasse noch keine hat */
function ensure_classes(array $u, int $examId = 0): void {
    $pdo = db(); $now = time();
    $q = $pdo->prepare('SELECT 1 FROM exams WHERE owner_id = ? AND class_id IS NULL AND trim(klasse) <> \'\'' . ($examId ? ' AND id = ?' : '') . ' LIMIT 1');
    $q->execute($examId ? [$u['id'], $examId] : [$u['id']]); if (!$q->fetchColumn()) return;
    $tx = !$pdo->inTransaction(); if ($tx) $pdo->exec('BEGIN IMMEDIATE'); // gleichzeitige Aufrufe legen keine doppelten Klassen an
    $st = $pdo->prepare('SELECT * FROM exams WHERE owner_id = ? AND class_id IS NULL AND trim(klasse) <> \'\'' . ($examId ? ' AND id = ?' : '') . ' ORDER BY roster_n DESC, id');
    $st->execute($examId ? [$u['id'], $examId] : [$u['id']]);
    foreach ($st->fetchAll() as $e) {
        $fid = (int)$e['fach_id']; $c = class_for($u, $e['schuljahr'], $e['klasse'], $fid);
        if (!$c) {
            $pdo->prepare('INSERT INTO classes (owner_id, schuljahr, name, fach_id, fach, roster_enc, roster_n, gewicht, created, updated) VALUES (?,?,?,?,?,?,?,2,?,?)')
                ->execute([$u['id'], $e['schuljahr'], trim($e['klasse']), $fid ?: null, (string)$e['fach'], $e['roster_enc'], $e['roster_enc'] ? (int)$e['roster_n'] : 0, $now, $now]);
            $cid = (int)$pdo->lastInsertId();
        } else {
            $cid = (int)$c['id'];
            if (!$c['roster_enc'] && $e['roster_enc']) $pdo->prepare('UPDATE classes SET roster_enc = ?, roster_n = ?, updated = ? WHERE id = ?')->execute([$e['roster_enc'], (int)$e['roster_n'], $now, $cid]);
        }
        $pdo->prepare('UPDATE exams SET class_id = ? WHERE id = ?')->execute([$cid, $e['id']]);
    }
    if ($tx) $pdo->exec('COMMIT');
}
function class_meta(array $c): array {
    $n = db()->prepare('SELECT COUNT(*) FROM exams WHERE class_id = ?'); $n->execute([$c['id']]);
    return ['id' => (int)$c['id'], 'schuljahr' => $c['schuljahr'], 'name' => $c['name'], 'fach_id' => $c['fach_id'] ? (int)$c['fach_id'] : null, 'fach' => $c['fach'],
        'roster_n' => (int)$c['roster_n'], 'gewicht' => (int)$c['gewicht'], 'n_exams' => (int)$n->fetchColumn(), 'created' => (int)$c['created'], 'updated' => (int)$c['updated']];
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
function exam_by_code(string $code, bool $pqrDraft = false): array {
    // vor dem Start unbekannt – außer für die Info-Abfrage bei persönlichen QR-Codes (die gibt es schon vorher auf Papier)
    $st = db()->prepare("SELECT * FROM exams WHERE code = ? AND (status <> 'entwurf'" . ($pqrDraft ? ' OR pqr = 1' : '') . ')'); $st->execute([strtoupper(trim($code))]);
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
/* Coaching */
function own_coaching(array $u, int $id): array {
    $st = db()->prepare('SELECT * FROM coachings WHERE id = ? AND owner_id = ?'); $st->execute([$id, $u['id']]);
    return $st->fetch() ?: fail('Coaching nicht gefunden', 404);
}
function c_meta(array $c): array {
    $n = fn(string $q) => (int)db()->query($q . (int)$c['id'])->fetchColumn();
    return ['id' => (int)$c['id'], 'schuljahr' => $c['schuljahr'], 'klasse' => $c['klasse'], 'titel' => $c['titel'], 'vorlage' => $c['vorlage'], 'gbogen' => $c['gbogen'],
        'rspec' => $c['rspec'] ? json_decode($c['rspec'], true) : null, 'class_id' => !empty($c['class_id']) ? (int)$c['class_id'] : null, 'gspec' => $c['gspec'] ? json_decode($c['gspec'], true) : null,
        'code' => $c['code'], 'open' => (bool)$c['open'], 'roster_n' => (int)$c['roster_n'], 'exported' => $c['exported'] ? (int)$c['exported'] : null,
        'reported' => $c['reported'] ? (int)$c['reported'] : null, 'created' => (int)$c['created'], 'updated' => (int)$c['updated'],
        'n_subs' => $n('SELECT COUNT(*) FROM coaching_subs WHERE coaching_id = '), 'n_done' => $n('SELECT COUNT(*) FROM coaching_notes WHERE done = 1 AND coaching_id = ')];
}
/** Schulvorlagen, die diese Person sehen darf: echte Konten alle der Schule, Demo-Konten nur die eigenen */
function ct_visible(array $u, int $id): ?array {
    $st = db()->prepare('SELECT t.*, COALESCE(o.is_demo, 0) AS odemo FROM ctemplates t LEFT JOIN users o ON o.id = t.owner_id WHERE t.id = ?'); $st->execute([$id]); $t = $st->fetch();
    if (!$t) return null;
    return $u['is_demo'] ? ((int)$t['owner_id'] === (int)$u['id'] ? $t : null) : ((int)$t['odemo'] ? null : $t);
}
function ct_editor(array $u): void { if (!$u['is_berater'] && !$u['is_admin'] && !$u['is_demo']) fail('Nur für die Schulberatung', 403); }
/** Vorlage für ein Coaching: eingebaut (Kürzel) oder Schulvorlage „x<id>“ → Kopie der Vorlage */
function c_tpl(array $u, string $v, string $kind): ?string {
    if (!preg_match('~^x(\d+)$~', $v, $m)) { if (!preg_match('~^[a-z0-9-]{1,12}$~', $v)) fail('Unbekannte Vorlage'); return null; }
    $t = ct_visible($u, (int)$m[1]); if (!$t || $t['kind'] !== $kind) fail('Diese Vorlage gibt es nicht (mehr).');
    $s = json_decode($t['spec'], true); $s['id'] = $v; $s['kind'] = $kind; $s['own'] = true; $s['label'] = $s['label'] ?? $t['label'];
    return json_encode($s, JSON_UNESCAPED_UNICODE);
}
function new_ccode(): string {
    $A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for ($t = 0; $t < 50; $t++) {
        $c = 'C'; for ($i = 0; $i < 9; $i++) $c .= $A[random_int(0, strlen($A) - 1)];
        $st = db()->prepare('SELECT 1 FROM coachings WHERE code = ?'); $st->execute([$c]); if (!$st->fetchColumn()) return $c;
    }
    fail('Kein freier Code');
}
function coaching_by_code(string $code): array {
    $st = db()->prepare('SELECT * FROM coachings WHERE code = ?'); $st->execute([strtoupper(preg_replace('~[^A-Za-z0-9]~', '', $code))]);
    return $st->fetch() ?: fail('Diesen Fragebogen gibt es nicht (mehr). Prüfe den QR-Code.', 404);
}
/* Umfragen */
const U_MIN = 5; // anonyme Umfragen: Ergebnisse erst ab so vielen Antworten (sonst ließe sich zurückrechnen, wer was geantwortet hat)
function own_survey(array $u, int $id): array {
    $st = db()->prepare('SELECT * FROM surveys WHERE id = ? AND owner_id = ?'); $st->execute([$id, $u['id']]);
    return $st->fetch() ?: fail('Umfrage nicht gefunden', 404);
}
function u_count(int $id): int { $st = db()->prepare('SELECT COUNT(*) FROM survey_answers WHERE survey_id = ?'); $st->execute([$id]); return (int)$st->fetchColumn(); }
/** Darf die Lehrkraft die Antworten sehen? Mit Namen immer; anonym erst ab U_MIN Antworten, mit Einmal-Codes zusätzlich erst nach dem Beenden */
function u_visible(array $s, int $n): bool { return $s['mode'] === 'name' || ($n >= U_MIN && ($s['mode'] === 'tafel' || $s['ended'])); }
function u_meta(array $s): array {
    $n = u_count((int)$s['id']);
    return ['id' => (int)$s['id'], 'schuljahr' => $s['schuljahr'], 'gruppe' => $s['gruppe'], 'titel' => $s['titel'], 'mode' => $s['mode'], 'code' => $s['code'],
        'open' => (bool)$s['open'], 'ended' => $s['ended'] ? (int)$s['ended'] : null, 'has_doc' => $s['doc_enc'] !== null, 'published' => $s['pub_doc'] !== null,
        'roster_n' => (int)$s['roster_n'], 'n' => $n, 'visible' => u_visible($s, $n), 'min' => U_MIN, 'created' => (int)$s['created'], 'updated' => (int)$s['updated']];
}
function new_ucode(): string {
    $A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for ($t = 0; $t < 50; $t++) {
        $c = 'U'; for ($i = 0; $i < 7; $i++) $c .= $A[random_int(0, strlen($A) - 1)];
        $st = db()->prepare('SELECT 1 FROM surveys WHERE code = ?'); $st->execute([$c]); if (!$st->fetchColumn()) return $c;
    }
    fail('Kein freier Code');
}
function survey_by_code(string $code): array {
    $st = db()->prepare('SELECT * FROM surveys WHERE code = ?'); $st->execute([strtoupper(preg_replace('~[^A-Za-z0-9]~', '', $code))]);
    return $st->fetch() ?: fail('Diese Umfrage gibt es nicht (mehr). Prüfe den QR-Code.', 404);
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
    $users = $pdo->query('SELECT id, kuerzel, name, is_admin, is_berater, must_setup, pub_key IS NOT NULL AS has_keys, last_login FROM users WHERE is_demo = 0 ORDER BY kuerzel')->fetchAll();
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
    $isAdmin = !empty($in['is_admin']) ? 1 : 0; $isBer = !empty($in['is_berater']) ? 1 : 0;
    $pdo->beginTransaction();
    try {
        if ($id) {
            if (!$isAdmin && (int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_admin = 1 AND id <> ' . $id)->fetchColumn() === 0) fail('Mindestens ein Admin muss bleiben');
            $pdo->prepare('UPDATE users SET kuerzel = ?, name = ?, is_admin = ?, is_berater = ? WHERE id = ?')->execute([$k, $name, $isAdmin, $isBer, $id]);
        } else { // Startpasswort: Salz und Login-Wert rechnet der Browser des Admins aus
            $salt = str($in, 'salt', 64, true); $auth = str($in, 'auth', 64, true); if (!b64ok($salt) || !hexok($auth)) fail('Ungültiges Startpasswort');
            $pdo->prepare('INSERT INTO users (kuerzel, name, is_admin, is_berater, salt, login_hash, must_setup, created) VALUES (?,?,?,?,?,?,1,?)')
                ->execute([$k, $name, $isAdmin, $isBer, $salt, password_hash($auth, PASSWORD_DEFAULT), time()]);
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
    ($sj ? db()->prepare('DELETE FROM classes WHERE schuljahr = ?') : db()->prepare('DELETE FROM classes'))->execute($sj ? [$sj] : []); // Klassen mit ihren Namenslisten
    db()->exec('VACUUM');
    out(['deleted' => $n]);
}
case 'security_check': { // liegt die Datenbank geschützt? (Die Oberfläche versucht zusätzlich, sie direkt abzurufen.)
    admin(); $d = realpath(data_dir()); $root = realpath(__DIR__);
    out(['inside_web' => str_starts_with((string)$d, (string)$root), 'htaccess' => is_file($d . '/.htaccess'), 'php' => PHP_VERSION, 'https' => $GLOBALS['https']]);
}

/* ---------- Prüfungen der Lehrkraft ---------- */
/* ---------- Admin: Datenbank-Sicherungen ---------- */
case 'bk_list': {
    admin(); $L = [];
    foreach (glob(backup_dir() . '/probe-*.sqlite') ?: [] as $f) $L[] = ['name' => basename($f), 'size' => filesize($f), 'time' => filemtime($f)];
    usort($L, fn($a, $b) => $b['time'] <=> $a['time'] ?: strcmp($b['name'], $a['name']));
    $log = @file(backup_dir() . '/protokoll.log', FILE_IGNORE_NEW_LINES) ?: [];
    out(['backups' => $L, 'keep' => BACKUP_KEEP, 'log' => array_slice(array_reverse($log), 0, 15)]);
}
case 'bk_create': { $u = admin(); $n = db_snapshot(db(), 'manuell-' . preg_replace('~[^a-z0-9]~', '', strtolower($u['kuerzel']))); if (!$n) fail('Sicherung fehlgeschlagen (siehe Protokoll)', 500); out(['name' => $n]); }
case 'bk_download': { // nur Admins; jeder Download wird protokolliert
    $u = admin(); $n = basename(str($in, 'name', 120));
    if (!preg_match('~^probe-[0-9a-z-]+\.sqlite$~', $n) || !is_file($f = backup_dir() . "/$n")) fail('Sicherung nicht gefunden', 404);
    backup_log("heruntergeladen $n von {$u['kuerzel']}");
    header('Content-Type: application/vnd.sqlite3'); header('Content-Disposition: attachment; filename="' . $n . '"'); header('Content-Length: ' . filesize($f));
    readfile($f); exit;
}
case 'set_prefs': {
    $u = teacher(); $in = (array)($in['prefs'] ?? []); $p = prefs_of($u);
    foreach (PREFS as $k) if (array_key_exists($k, $in)) $p[$k] = (bool)$in[$k];
    if (array_key_exists('theme', $in)) $p['theme'] = in_array($in['theme'], THEMES, true) ? $in['theme'] : 'blau';
    db()->prepare('UPDATE users SET prefs = ? WHERE id = ?')->execute([json_encode($p), $u['id']]); out(['prefs' => $p]);
}
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
    $u = teacher(); ensure_classes($u); $st = db()->prepare('SELECT * FROM exams WHERE owner_id = ? AND schuljahr = ? ORDER BY klasse COLLATE NOCASE, datum, id');
    $st->execute([$u['id'], str($in, 'schuljahr', 9) ?: schuljahr()]);
    out(['exams' => array_map('exam_meta', $st->fetchAll())]);
}
case 'demo_seed': { // Beispielprüfungen: Physik „7d“ geschrieben und zur Korrektur bereit, Physik „7p“ und Englisch „6a“ fertig vorbereitet (Inhalte im Browser verschlüsselt)
    $u = teacher(); $pdo = db();
    $X = $in['exams'] ?? null; if (!is_array($X) || count($X) < 1 || count($X) > 6) fail('Ungültige Beispieldaten');
    $pdo->beginTransaction();
    $st = $pdo->prepare('UPDATE users SET demo = 1 WHERE id = ?' . (empty($in['force']) ? ' AND demo = 0' : '')); $st->execute([$u['id']]);
    if (!$st->rowCount()) { $pdo->rollBack(); out(['skipped' => true]); }
    $fst = $pdo->prepare('SELECT id, name FROM faecher WHERE name = ? COLLATE NOCASE');
    $sj = schuljahr(); $day = fn(int $d) => schuljahr(date('Y-m-d', time() + $d * 86400)) === $sj ? date('Y-m-d', time() + $d * 86400) : date('Y-m-d');
    $res = [];
    foreach ($X as $x) {
        $done = !empty($x['done']); $datum = $day($done ? -7 : 7); $now = time();
        $fname = str($x, 'fach', 60) ?: 'Physik'; $fst->execute([$fname]); $f = $fst->fetch(); // Fach und Art je Beispiel
        $art = in_array($x['art'] ?? '', ARTEN, true) ? $x['art'] : 'Kurzarbeit';
        $opened = strtotime($datum . ' 08:05'); if ($opened > $now) $opened = $now - 3600;
        $parts = $done ? (array)($x['participants'] ?? []) : []; if (count($parts) > 40) fail('Zu viele Teilnehmer');
        $pdo->prepare("INSERT INTO exams (owner_id, schuljahr, klasse, fach_id, fach, datum, art, titel, erwartet, dauer, pin_on, skala, status, draft_enc, key_enc, student_doc, roster_enc, roster_n,
            aufgaben, punkte, fertig, created, updated, code, pin, join_open, opened, ended) VALUES (?,?,?,?,?,?,?,?,?,?,1,'noten',?,?,?,?,?,?,?,?,1,?,?,?,?,0,?,?)")
            ->execute([$u['id'], schuljahr($datum), str($x, 'klasse', 20, true), $f ? (int)$f['id'] : null, $f ? $f['name'] : $fname, $datum, $art, str($x, 'titel', 200),
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
    ensure_classes($u);
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
    $cid = (int)($in['class_id'] ?? 0); if ($cid) own_class($u, $cid);
    if ($id) { own_exam($u, $id); $pdo->prepare('UPDATE exams SET klasse=?, fach_id=?, fach=?, datum=?, art=?, erwartet=?, dauer=?, pin_on=?, skala=?, schuljahr=?, updated=? WHERE id=?')->execute([...$v, $id]); }
    else { $pdo->prepare('INSERT INTO exams (klasse, fach_id, fach, datum, art, erwartet, dauer, pin_on, skala, schuljahr, updated, owner_id, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([...$v, $u['id'], time()]); $id = (int)$pdo->lastInsertId(); }
    // Klasse: ausdrücklich gewählt, sonst die Klasse mit gleichem Namen und Fach (passt die bisherige nicht mehr, neu zuordnen)
    $e = own_exam($u, $id);
    if (!$cid) {
        $cur = $e['class_id'] ? db()->query('SELECT * FROM classes WHERE id = ' . (int)$e['class_id'])->fetch() : null;
        $fits = $cur && $cur['schuljahr'] === $e['schuljahr'] && mb_strtolower(trim($cur['name'])) === mb_strtolower(trim($klasse)) && (!$cur['fach_id'] || (int)$cur['fach_id'] === $fid);
        $cid = $fits ? (int)$cur['id'] : 0;
    }
    $pdo->prepare('UPDATE exams SET class_id = ? WHERE id = ?')->execute([$cid ?: null, $id]);
    if (!$cid) { ensure_classes($u, $id); $cid = (int)own_exam($u, $id)['class_id']; $e = own_exam($u, $id); }
    if ($cid && !$e['roster_enc']) { // Namensliste der Klasse übernehmen (beides für dieselbe Lehrkraft verschlüsselt)
        $c = own_class($u, $cid);
        if ($c['roster_enc']) $pdo->prepare('UPDATE exams SET roster_enc = ?, roster_n = ?, erwartet = CASE WHEN erwartet = 0 THEN ? ELSE erwartet END WHERE id = ?')->execute([$c['roster_enc'], $c['roster_n'], $c['roster_n'], $id]);
    }
    out(['exam' => exam_meta(own_exam($u, $id))]);
}
/* ---------- Klassen: Lerngruppen der Lehrkraft (Name im Klartext wie bei Prüfungen, Namensliste verschlüsselt) ---------- */
case 'cl_list': {
    $u = teacher(); $sj = str($in, 'schuljahr', 9); ensure_classes($u);
    $st = db()->prepare('SELECT * FROM classes WHERE owner_id = ?' . ($sj ? ' AND schuljahr = ?' : '') . ' ORDER BY name'); $st->execute($sj ? [$u['id'], $sj] : [$u['id']]);
    out(['classes' => array_map('class_meta', $st->fetchAll())]);
}
case 'cl_get': { // Klasse mit Namensliste und ihren Prüfungen (mit verschlüsselter Notenübersicht)
    $u = teacher(); $c = own_class($u, (int)($in['id'] ?? 0));
    $st = db()->prepare('SELECT * FROM exams WHERE class_id = ? AND owner_id = ? ORDER BY datum, id'); $st->execute([$c['id'], $u['id']]);
    $d = db()->prepare('SELECT data_enc, n, created, updated FROM drops WHERE class_id = ?'); $d->execute([$c['id']]); $d = $d->fetch() ?: null;
    out(['class' => class_meta($c), 'roster_enc' => $c['roster_enc'], 'marks_enc' => $c['marks_enc'], 'marks_rev' => (int)$c['marks_rev'],
        'drop' => $d ? ['data_enc' => $d['data_enc'], 'n' => (int)$d['n'], 'created' => (int)$d['created'], 'updated' => $d['updated'] ? (int)$d['updated'] : null] : null, 'exams' => array_map(fn($e) => exam_meta($e) + ['notes_enc' => $e['notes_enc']], $st->fetchAll())]);
}
case 'cl_save': {
    $u = teacher(); $pdo = db(); $id = (int)($in['id'] ?? 0);
    $name = str($in, 'name', 20, true); $fid = (int)($in['fach_id'] ?? 0); $fach = '';
    if ($fid) { $st = $pdo->prepare('SELECT name FROM faecher WHERE id = ?'); $st->execute([$fid]); $fach = (string)$st->fetchColumn(); if ($fach === '') $fid = 0; }
    $roster = blob($in, 'roster_enc', 600_000); $n = max(0, min(200, (int)($in['roster_n'] ?? 0))); $gw = max(1, min(4, (int)($in['gewicht'] ?? 2))); $now = time();
    if ($id) {
        $c = own_class($u, $id);
        $pdo->prepare('UPDATE classes SET name = ?, fach_id = ?, fach = ?, roster_enc = COALESCE(?, roster_enc), roster_n = ?, gewicht = ?, updated = ? WHERE id = ?')
            ->execute([$name, $fid ?: null, $fach, $roster, $roster !== null ? $n : (int)$c['roster_n'], $gw, $now, $id]);
    } else {
        $sj = str($in, 'schuljahr', 9) ?: schuljahr();
        $pdo->prepare('INSERT INTO classes (owner_id, schuljahr, name, fach_id, fach, roster_enc, roster_n, gewicht, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$u['id'], $sj, $name, $fid ?: null, $fach, $roster, $n, $gw, $now, $now]);
        $id = (int)$pdo->lastInsertId();
        // vorhandene Prüfungen dieser Klasse (gleicher Name, gleiches Schuljahr, gleiches Fach falls angegeben) gehören dazu
        $pdo->prepare('UPDATE exams SET class_id = ? WHERE owner_id = ? AND class_id IS NULL AND schuljahr = ? AND klasse = ? COLLATE NOCASE' . ($fid ? ' AND fach_id = ?' : ''))
            ->execute($fid ? [$id, $u['id'], $sj, $name, $fid] : [$id, $u['id'], $sj, $name]);
    }
    out(['class' => class_meta(own_class($u, $id))]);
}
case 'cl_marks': { // eigene Noten der Klasse speichern; hat ein anderes Gerät inzwischen gespeichert, holt der Browser den neuen Stand und wendet seine Änderung erneut an
    $u = teacher(); $c = own_class($u, (int)($in['id'] ?? 0)); $m = blob($in, 'marks_enc', 2_000_000); if ($m === null) fail('Noten fehlen');
    $st = db()->prepare('UPDATE classes SET marks_enc = ?, marks_rev = marks_rev + 1, updated = ? WHERE id = ? AND marks_rev = ?'); $st->execute([$m, time(), $c['id'], (int)($in['rev'] ?? 0)]);
    if (!$st->rowCount()) { $c = own_class($u, $c['id']); out(['conflict' => true, 'marks_enc' => $c['marks_enc'], 'marks_rev' => (int)$c['marks_rev']]); }
    out(['rev' => (int)$c['marks_rev'] + 1]);
}
case 'cl_drop_new': { // PlanPad verbinden: neuer Token (nur einmal sichtbar); ein alter verliert seine Gültigkeit
    $u = teacher(); $c = own_class($u, (int)($in['id'] ?? 0));
    $t = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
    db()->prepare('DELETE FROM drops WHERE class_id = ?')->execute([$c['id']]);
    db()->prepare('INSERT INTO drops (owner_id, class_id, token_hash, created) VALUES (?,?,?,?)')->execute([$u['id'], $c['id'], hash('sha256', $t), time()]);
    out(['token' => $t]);
}
case 'cl_drop_del': { $u = teacher(); $c = own_class($u, (int)($in['id'] ?? 0)); db()->prepare('DELETE FROM drops WHERE class_id = ?')->execute([$c['id']]); out([]); }
case 'cl_delete': { // nur leere Klassen: solange es Prüfungen gibt, gehört die Klasse dazu
    $u = teacher(); $c = own_class($u, (int)($in['id'] ?? 0));
    $n = db()->prepare('SELECT COUNT(*) FROM exams WHERE class_id = ?'); $n->execute([$c['id']]); $n = (int)$n->fetchColumn();
    if ($n) fail("Die Klasse enthält noch $n Prüfung" . ($n === 1 ? '' : 'en') . ' – lösche sie zuerst oder ordne sie einer anderen Klasse zu.', 409);
    db()->prepare('DELETE FROM classes WHERE id = ?')->execute([$c['id']]); out([]);
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
case 'exam_pqr': { // Persönliche QR-Codes an/aus (nur vor dem Start); an: Prüfungscode schon jetzt vergeben, er steht in den gedruckten QR-Codes
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    if ($e['status'] !== 'entwurf') fail('Die Prüfung wurde schon gestartet.', 409);
    $on = !empty($in['on']) ? 1 : 0;
    db()->prepare('UPDATE exams SET pqr = ?, updated = ? WHERE id = ?')->execute([$on, time(), $e['id']]);
    if ($on && !$e['code']) db()->prepare('UPDATE exams SET code = ? WHERE id = ? AND code IS NULL')->execute([new_code(), $e['id']]);
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
/* ---------- Coaching ----------
   Schüler füllen vor dem Coachinggespräch einen Fragebogen aus (persönlicher QR-Code). Name und Antworten verschlüsselt ihr
   iPad für die Klassleitung; die Gesprächsnotizen verschlüsselt der Browser der Lehrkraft für sie selbst. Der Server sieht nur
   Klasse, Titel, Vorlagen und Zähler. Die Schulberatung bekommt nur Zahlen ohne Namen (für sie verschlüsselt). */
case 'c_list': {
    $u = teacher(); $sj = str($in, 'schuljahr', 9);
    $st = db()->prepare('SELECT c.*, (SELECT COUNT(*) FROM coaching_subs s WHERE s.coaching_id = c.id) AS n_subs,
        (SELECT COUNT(*) FROM coaching_notes n WHERE n.coaching_id = c.id AND n.done = 1) AS n_done FROM coachings c WHERE owner_id = ?' . ($sj ? ' AND schuljahr = ?' : '') . ' ORDER BY klasse, created');
    $st->execute($sj ? [$u['id'], $sj] : [$u['id']]);
    out(['coachings' => array_map('c_meta', $st->fetchAll())]);
}
case 'c_save': { // anlegen oder ändern (Titel, Vorlagen, Klassenliste)
    $u = teacher(); if (!$u['pub_key']) fail('Kein Schlüssel');
    $id = (int)($in['id'] ?? 0); $klasse = str($in, 'klasse', 20, true); $titel = str($in, 'titel', 120);
    $vor = str($in, 'vorlage', 12, true); $gb = str($in, 'gbogen', 12, true);
    $roster = blob($in, 'roster_enc', 400_000); $n = max(0, min(200, (int)($in['roster_n'] ?? 0)));
    $tids = array_values(array_filter((array)($in['tids'] ?? []), fn($t) => is_string($t) && hexok($t)));
    if (count($tids) > 200) fail('Zu viele Schüler');
    $now = time(); $pdo = db();
    if ($id) {
        $c = own_coaching($u, $id);
        // Schulvorlage: Kopie nur beim Wechsel neu ziehen – spätere Änderungen der Schulberatung verändern laufende Coachings nicht
        $rs = $vor === $c['vorlage'] ? $c['rspec'] : c_tpl($u, $vor, 'reflexion'); $gs = $gb === $c['gbogen'] ? $c['gspec'] : c_tpl($u, $gb, 'gespraech');
        $pdo->prepare('UPDATE coachings SET klasse = ?, titel = ?, vorlage = ?, gbogen = ?, rspec = ?, gspec = ?, roster_enc = COALESCE(?, roster_enc), roster_n = ?, tids = ?, updated = ? WHERE id = ?')
            ->execute([$klasse, $titel, $vor, $gb, $rs, $gs, $roster, $roster !== null ? $n : (int)$c['roster_n'], $roster !== null ? json_encode($tids) : $c['tids'], $now, $id]);
    } else {
        $pdo->prepare('INSERT INTO coachings (owner_id, schuljahr, klasse, titel, vorlage, gbogen, rspec, gspec, code, roster_enc, roster_n, tids, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$u['id'], schuljahr(), $klasse, $titel, $vor, $gb, c_tpl($u, $vor, 'reflexion'), c_tpl($u, $gb, 'gespraech'), new_ccode(), $roster, $n, json_encode($tids), $now, $now]);
        $id = (int)$pdo->lastInsertId();
    }
    if (array_key_exists('class_id', $in)) { $cid = (int)$in['class_id']; if ($cid) own_class($u, $cid); db()->prepare('UPDATE coachings SET class_id = ? WHERE id = ?')->execute([$cid ?: null, $id]); }
    out(['coaching' => c_meta(own_coaching($u, $id))]);
}
case 'c_get': { // alles zu einem Coaching (verschlüsselt)
    $u = teacher(); $c = own_coaching($u, (int)($in['id'] ?? 0));
    $s = db()->prepare('SELECT tid, identity_enc, answers_enc, at, n FROM coaching_subs WHERE coaching_id = ? ORDER BY at'); $s->execute([$c['id']]);
    $n = db()->prepare('SELECT tid, note_enc, done, updated FROM coaching_notes WHERE coaching_id = ?'); $n->execute([$c['id']]);
    out(['coaching' => c_meta($c), 'roster_enc' => $c['roster_enc'], 'subs' => $s->fetchAll(), 'notes' => $n->fetchAll()]);
}
case 'c_open': { $u = teacher(); $c = own_coaching($u, (int)($in['id'] ?? 0)); db()->prepare('UPDATE coachings SET open = ?, updated = ? WHERE id = ?')->execute([!empty($in['open']) ? 1 : 0, time(), $c['id']]); out([]); }
case 'c_note': { // Gesprächsnotiz speichern (verschlüsselt für die Lehrkraft selbst)
    $u = teacher(); $c = own_coaching($u, (int)($in['id'] ?? 0));
    $tid = str($in, 'tid', 64, true); if (!hexok($tid)) fail('Ungültige Kennung');
    $enc = blob($in, 'note_enc', 400_000); if (!$enc) fail('Notiz fehlt');
    db()->prepare('INSERT INTO coaching_notes (coaching_id, tid, note_enc, done, updated) VALUES (?,?,?,?,?) ON CONFLICT(coaching_id, tid) DO UPDATE SET note_enc = excluded.note_enc, done = excluded.done, updated = excluded.updated')
        ->execute([$c['id'], $tid, $enc, !empty($in['done']) ? 1 : 0, time()]);
    out(['updated' => time()]);
}
case 'c_delete': { $u = teacher(); $c = own_coaching($u, (int)($in['id'] ?? 0)); db()->prepare('DELETE FROM coachings WHERE id = ?')->execute([$c['id']]); out([]); }
case 'c_exported': { $u = teacher(); foreach ((array)($in['ids'] ?? []) as $i) db()->prepare('UPDATE coachings SET exported = ? WHERE id = ? AND owner_id = ?')->execute([time(), (int)$i, $u['id']]); out([]); }
case 'c_colleagues': { // öffentliche Schlüssel der Kolleg:innen (Übergabe an die nächste Klassleitung)
    $u = teacher(); if ($u['is_demo']) out(['users' => []]);
    out(['users' => db()->query('SELECT id, kuerzel, name, pub_key FROM users WHERE is_demo = 0 AND must_setup = 0 AND pub_key IS NOT NULL AND id <> ' . (int)$u['id'] . ' ORDER BY kuerzel')->fetchAll()]);
}
case 'c_berater': { // Schulberatung: Empfänger der anonymisierten Auswertung
    $u = teacher();
    // Demo-Konto: Es ist selbst die Schulberatung (zum Ausprobieren), echte Empfänger sieht es nicht
    if ($u['is_demo']) out(['users' => [['id' => (int)$u['id'], 'kuerzel' => $u['kuerzel'], 'name' => 'Schulberatung (Demo)', 'pub_key' => $u['pub_key']]]]);
    $st = db()->prepare('SELECT id, kuerzel, name, pub_key FROM users WHERE is_berater = 1 AND pub_key IS NOT NULL AND must_setup = 0 AND is_demo = 0 ORDER BY kuerzel'); $st->execute();
    out(['users' => $st->fetchAll()]);
}
case 'c_report': { // anonymisierte Auswertung (nur Zahlen) an die Schulberatung; erneutes Einreichen ersetzt sie
    $u = teacher(); $c = own_coaching($u, (int)($in['id'] ?? 0));
    $enc = $in['enc'] ?? null; if (!is_array($enc) || !$enc) fail('Keine Empfänger');
    $ok = []; foreach ($enc as $k => $v) { if (!is_string($v) || strlen($v) > 200_000) fail('Daten zu groß'); $ok[(string)(int)$k] = $v; }
    preg_match('~\d+~', $c['klasse'], $m); $jg = (int)($m[0] ?? 0);
    db()->prepare('INSERT INTO coaching_reports (coaching_id, owner_id, lehrkraft, schuljahr, klasse, jgst, vorlage, enc, created) VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(coaching_id) DO UPDATE SET enc = excluded.enc, created = excluded.created, klasse = excluded.klasse, jgst = excluded.jgst, vorlage = excluded.vorlage')
        ->execute([$c['id'], $u['id'], $u['name'] ?: $u['kuerzel'], $c['schuljahr'], $c['klasse'], $jg, $c['vorlage'], json_encode($ok), time()]);
    db()->prepare('UPDATE coachings SET reported = ? WHERE id = ?')->execute([time(), $c['id']]);
    out([]);
}
case 'c_reports': { // Schulberatung: alle eingereichten Auswertungen, je mit dem für sie verschlüsselten Teil
    $u = teacher(); if (!$u['is_berater'] && !$u['is_demo']) fail('Nur für die Schulberatung', 403);
    $out = [];
    foreach (db()->query('SELECT id, lehrkraft, schuljahr, klasse, jgst, vorlage, enc, created FROM coaching_reports ORDER BY schuljahr DESC, jgst, klasse')->fetchAll() as $r) {
        $e = json_decode($r['enc'], true); if (!isset($e[(string)$u['id']])) continue;
        $r['enc'] = $e[(string)$u['id']]; $out[] = $r;
    }
    out(['reports' => $out]);
}
case 'c_purge_all': { // Admin: Coaching-Daten ALLER Lehrkräfte löschen (Fragebögen, Notizen, Klassenlisten); optional auch die Auswertungen der Schulberatung
    admin(); if (($in['confirm'] ?? '') !== 'COACHING LÖSCHEN') fail('Bestätigung fehlt');
    $n = (int)db()->query('SELECT COUNT(*) FROM coachings')->fetchColumn();
    db()->exec('DELETE FROM coachings'); db()->exec('DELETE FROM talks'); // Gesprächsnotizen gehören dazu
    if (!empty($in['reports'])) db()->exec('DELETE FROM coaching_reports');
    db()->exec('VACUUM');
    out(['deleted' => $n]);
}
/* ---------- Gespräche: einzelne Gesprächsnotizen ----------
   Der Server sieht nur Schuljahr und Zeitpunkte; mit wem, wann, wo, Thema und Inhalt verschlüsselt der Browser der Lehrkraft
   für sie selbst (wie die Coaching-Notizen). Probe löscht nie von selbst. */
case 't_list': {
    $u = teacher(); $st = db()->prepare('SELECT id, schuljahr, enc, exported, created, updated FROM talks WHERE owner_id = ? ORDER BY id'); $st->execute([$u['id']]);
    out(['talks' => array_map(fn($t) => ['id' => (int)$t['id'], 'schuljahr' => $t['schuljahr'], 'enc' => $t['enc'], 'exported' => $t['exported'] ? (int)$t['exported'] : null, 'created' => (int)$t['created'], 'updated' => (int)$t['updated']], $st->fetchAll())]);
}
case 't_save': {
    $u = teacher(); $id = (int)($in['id'] ?? 0); $enc = blob($in, 'enc', 400_000); if (!$enc) fail('Notiz fehlt');
    $now = time(); $sj = schuljahr(preg_match('~^\d{4}-\d{2}-\d{2}$~', (string)($in['datum'] ?? '')) ? $in['datum'] : null);
    if ($id) {
        $st = db()->prepare('UPDATE talks SET enc = ?, schuljahr = ?, updated = ? WHERE id = ? AND owner_id = ?'); $st->execute([$enc, $sj, $now, $id, $u['id']]);
        if (!$st->rowCount()) fail('Gespräch nicht gefunden', 404);
    } else {
        $n = db()->prepare('SELECT COUNT(*) FROM talks WHERE owner_id = ?'); $n->execute([$u['id']]); if ((int)$n->fetchColumn() >= 3000) fail('Zu viele Gesprächsnotizen – bitte alte exportieren und löschen.');
        db()->prepare('INSERT INTO talks (owner_id, schuljahr, enc, created, updated) VALUES (?,?,?,?,?)')->execute([$u['id'], $sj, $enc, $now, $now]); $id = (int)db()->lastInsertId();
    }
    out(['id' => $id, 'updated' => $now, 'schuljahr' => $sj]);
}
case 't_delete': { $u = teacher(); foreach ((array)($in['ids'] ?? []) as $i) db()->prepare('DELETE FROM talks WHERE id = ? AND owner_id = ?')->execute([(int)$i, $u['id']]); out([]); }
case 't_exported': { $u = teacher(); foreach ((array)($in['ids'] ?? []) as $i) db()->prepare('UPDATE talks SET exported = ? WHERE id = ? AND owner_id = ?')->execute([time(), (int)$i, $u['id']]); out([]); }
/* Vorlagen der Schule: Selbstreflexion und Gesprächsbogen, gestaltet von der Schulberatung in PathFinder */
case 'ct_list': { // alle sichtbaren Vorlagen (für die Auswahl beim Anlegen nur freigegebene, für die Schulberatung alle)
    $u = teacher();
    $st = db()->prepare('SELECT t.id, t.kind, t.label, t.active, t.spec, t.updated, t.owner_id, COALESCE(NULLIF(o.name, \'\'), o.kuerzel, \'\') AS von FROM ctemplates t LEFT JOIN users o ON o.id = t.owner_id
        WHERE ' . ($u['is_demo'] ? 't.owner_id = ?' : 'COALESCE(o.is_demo, 0) = 0 AND ? > 0') . ' ORDER BY t.kind DESC, t.label');
    $st->execute([$u['id']]);
    out(['templates' => array_map(fn($t) => ['id' => (int)$t['id'], 'kind' => $t['kind'], 'label' => $t['label'], 'active' => (bool)$t['active'], 'spec' => json_decode($t['spec'], true),
        'updated' => (int)$t['updated'], 'von' => $t['von'], 'mine' => (int)$t['owner_id'] === (int)$u['id']], $st->fetchAll()), 'editor' => (bool)($u['is_berater'] || $u['is_admin'] || $u['is_demo'])]);
}
case 'ct_get': { $u = teacher(); ct_editor($u); $t = ct_visible($u, (int)($in['id'] ?? 0)) ?: fail('Vorlage nicht gefunden', 404); out(['doc' => json_decode($t['doc'], true)]); }
case 'ct_save': { // Schulberatung: Vorlage anlegen oder ändern (PathFinder-Dokument und die daraus berechnete Vorlage)
    $u = teacher(); ct_editor($u);
    $id = (int)($in['id'] ?? 0); $kind = str($in, 'kind', 10, true); if (!in_array($kind, ['reflexion', 'gespraech'], true)) fail('Unbekannte Art');
    $doc = blob($in, 'doc', 6_000_000); $spec = blob($in, 'spec', 400_000); if (!$doc || !$spec) fail('Inhalt fehlt');
    $d = json_decode($doc, true); $s = json_decode($spec, true);
    if (($d['form'] ?? '') !== 'befragung' || !is_array($s['sections'] ?? null)) fail('Das ist kein Fragebogen.');
    $label = str($in, 'label', 120) ?: 'Eigene Vorlage'; $now = time(); $pdo = db();
    if ($id) {
        $t = ct_visible($u, $id) ?: fail('Vorlage nicht gefunden', 404);
        $pdo->prepare('UPDATE ctemplates SET label = ?, doc = ?, spec = ?, updated = ? WHERE id = ?')->execute([$label, $doc, $spec, $now, $id]);
    } else {
        $pdo->prepare('INSERT INTO ctemplates (owner_id, kind, label, doc, spec, active, created, updated) VALUES (?,?,?,?,?,0,?,?)')->execute([$u['id'], $kind, $label, $doc, $spec, $now, $now]);
        $id = (int)$pdo->lastInsertId();
    }
    out(['id' => $id]);
}
case 'ct_active': { $u = teacher(); ct_editor($u); $t = ct_visible($u, (int)($in['id'] ?? 0)) ?: fail('Vorlage nicht gefunden', 404); db()->prepare('UPDATE ctemplates SET active = ?, updated = ? WHERE id = ?')->execute([!empty($in['active']) ? 1 : 0, time(), $t['id']]); out([]); }
case 'ct_delete': { // laufende Coachings behalten ihre Kopie der Vorlage
    $u = teacher(); ct_editor($u); $t = ct_visible($u, (int)($in['id'] ?? 0)) ?: fail('Vorlage nicht gefunden', 404); db()->prepare('DELETE FROM ctemplates WHERE id = ?')->execute([$t['id']]); out([]);
}
/* Schüler (ohne Anmeldung, nur mit persönlichem QR-Code) */
case 'c_info': {
    $c = coaching_by_code((string)($in['code'] ?? ''));
    $o = user((int)$c['owner_id']);
    out(['klasse' => $c['klasse'], 'titel' => $c['titel'], 'vorlage' => $c['vorlage'], 'spec' => $c['rspec'] ? json_decode($c['rspec'], true) : null, 'open' => (bool)$c['open'], 'pub_key' => $o['pub_key'] ?? null, 'lehrkraft' => $o['name'] ?: $o['kuerzel']]);
}
case 'c_submit': {
    $c = coaching_by_code((string)($in['code'] ?? ''));
    if (!$c['open']) fail('Der Fragebogen ist geschlossen. Sprich mit deiner Klassleitung.', 409);
    $tid = (string)($in['tid'] ?? ''); if (!hexok($tid) || !in_array($tid, json_decode($c['tids'], true) ?: [], true)) fail('Dieser QR-Code gilt nicht (mehr). Sprich mit deiner Klassleitung.', 403);
    $id = blob($in, 'identity_enc', 20_000); $an = blob($in, 'answers_enc', 300_000); if (!$id || !$an) fail('Daten fehlen');
    db()->prepare('INSERT INTO coaching_subs (coaching_id, tid, identity_enc, answers_enc, at) VALUES (?,?,?,?,?) ON CONFLICT(coaching_id, tid) DO UPDATE SET identity_enc = excluded.identity_enc, answers_enc = excluded.answers_enc, at = excluded.at, n = n + 1')
        ->execute([$c['id'], $tid, $id, $an, time()]);
    out([]);
}
/* ---------- Umfragen ----------
   Fragebogen aus PathFinder (Art „Befragung“). Antworten verschlüsselt der Browser der Teilnehmenden mit dem Schlüssel der
   Lehrkraft. Drei Arten: tafel (ein QR-Code für alle, anonym), einmal (jede:r einen Code, der nur einmal gilt – verbrauchte
   Codes liegen getrennt von den Antworten, Antworten ohne Code und ohne Zeit), name (persönliche QR-Codes, mit Namen). */
case 'u_list': {
    $u = teacher(); $sj = str($in, 'schuljahr', 9);
    $st = db()->prepare('SELECT * FROM surveys WHERE owner_id = ?' . ($sj ? ' AND schuljahr = ?' : '') . ' ORDER BY created DESC');
    $st->execute($sj ? [$u['id'], $sj] : [$u['id']]);
    out(['surveys' => array_map('u_meta', $st->fetchAll())]);
}
case 'u_save': { // anlegen oder ändern: Gruppe, Titel, Art, Teilnehmende bzw. Einmal-Codes
    $u = teacher(); if (!$u['pub_key']) fail('Kein Schlüssel');
    $id = (int)($in['id'] ?? 0); $gruppe = str($in, 'gruppe', 40); $titel = str($in, 'titel', 160); $mode = str($in, 'mode', 8, true);
    if (!in_array($mode, ['tafel', 'einmal', 'name'], true)) fail('Unbekannte Art');
    $roster = blob($in, 'roster_enc', 600_000); $n = max(0, min(500, (int)($in['roster_n'] ?? 0)));
    $tids = array_values(array_unique(array_filter((array)($in['tids'] ?? []), fn($t) => is_string($t) && hexok($t))));
    if (count($tids) > 500) fail('Höchstens 500 Teilnehmende');
    if ($mode !== 'tafel' && $roster !== null && !$tids) fail('Teilnehmende fehlen');
    $now = time(); $pdo = db();
    if ($id) {
        $s = own_survey($u, $id);
        if ($mode !== $s['mode'] && u_count($id)) fail('Die Art lässt sich nicht mehr ändern – es gibt schon Antworten.');
        if ($s['mode'] === 'einmal' && $roster !== null) { // gedruckte Codes, die schon benutzt wurden, müssen bleiben
            $used = $pdo->prepare('SELECT tid FROM survey_used WHERE survey_id = ?'); $used->execute([$id]);
            foreach ($used->fetchAll(PDO::FETCH_COLUMN) as $t) if (!in_array($t, $tids, true)) fail('Benutzte Codes lassen sich nicht entfernen.');
        }
        $pdo->prepare('UPDATE surveys SET gruppe = ?, titel = ?, mode = ?, roster_enc = COALESCE(?, roster_enc), roster_n = ?, tids = ?, updated = ? WHERE id = ?')
            ->execute([$gruppe, $titel ?: $s['titel'], $mode, $roster, $roster !== null ? $n : (int)$s['roster_n'], $roster !== null ? json_encode($tids) : $s['tids'], $now, $id]);
    } else {
        $pdo->prepare('INSERT INTO surveys (owner_id, schuljahr, gruppe, titel, mode, code, roster_enc, roster_n, tids, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$u['id'], schuljahr(), $gruppe, $titel, $mode, new_ucode(), $roster, $n, json_encode($tids), $now, $now]);
        $id = (int)$pdo->lastInsertId();
    }
    out(['survey' => u_meta(own_survey($u, $id))]);
}
case 'u_doc': { // Fragebogen aus PathFinder: Entwurf (verschlüsselt); beim Fertigstellen auch die Fassung für die Teilnehmenden
    $u = teacher(); $s = own_survey($u, (int)($in['id'] ?? 0));
    $enc = blob($in, 'doc_enc', 20_000_000); if (!$enc) fail('Inhalt fehlt');
    $pub = blob($in, 'pub_doc', 12_000_000);
    if ($pub !== null) {
        $d = json_decode($pub, true); if (!is_array($d) || ($d['form'] ?? '') !== 'befragung' || !is_array($d['stations'] ?? null)) fail('Das ist kein Fragebogen.');
        if (u_count((int)$s['id']) && $pub !== $s['pub_doc']) fail('Es gibt schon Antworten – die Fragen lassen sich nicht mehr ändern. Lege für neue Fragen eine neue Umfrage an.', 409);
    }
    $titel = str($in, 'titel', 160);
    db()->prepare('UPDATE surveys SET doc_enc = ?, pub_doc = COALESCE(?, pub_doc), titel = CASE WHEN ? <> \'\' THEN ? ELSE titel END, updated = ? WHERE id = ?')
        ->execute([$enc, $pub, $titel, $titel, time(), $s['id']]);
    out(['survey' => u_meta(own_survey($u, (int)$s['id']))]);
}
case 'u_get': { // alles zu einer Umfrage; Antworten nur, wenn sie sichtbar sein dürfen
    $u = teacher(); $s = own_survey($u, (int)($in['id'] ?? 0)); $m = u_meta($s); $ans = [];
    if ($m['visible']) { $st = db()->prepare('SELECT k, answers_enc FROM survey_answers WHERE survey_id = ? ORDER BY k'); $st->execute([$s['id']]); $ans = $st->fetchAll(); }
    if ($s['mode'] !== 'name') foreach ($ans as &$x) unset($x['k']); unset($x);
    if ($s['mode'] !== 'name') shuffle($ans);
    out(['survey' => $m, 'doc_enc' => $s['doc_enc'], 'roster_enc' => $s['roster_enc'], 'answers' => $ans]);
}
case 'u_open': {
    $u = teacher(); $s = own_survey($u, (int)($in['id'] ?? 0)); $open = !empty($in['open']);
    if ($open && !$s['pub_doc']) fail('Erst den Fragebogen fertigstellen.');
    if ($open && $s['ended'] && $s['mode'] === 'einmal') fail('Die Umfrage ist beendet. Für eine neue Runde lege eine neue Umfrage an.');
    db()->prepare('UPDATE surveys SET open = ?, ended = CASE WHEN ? THEN NULL ELSE ended END, updated = ? WHERE id = ?')->execute([$open ? 1 : 0, $open ? 1 : 0, time(), $s['id']]);
    out(['survey' => u_meta(own_survey($u, (int)$s['id']))]);
}
case 'u_end': { // beenden: keine Antworten mehr; anonyme Umfragen mit Einmal-Codes zeigen erst jetzt Ergebnisse (endgültig)
    $u = teacher(); $s = own_survey($u, (int)($in['id'] ?? 0));
    db()->prepare('UPDATE surveys SET open = 0, ended = ?, updated = ? WHERE id = ?')->execute([time(), time(), $s['id']]);
    out(['survey' => u_meta(own_survey($u, (int)$s['id']))]);
}
case 'u_delete': { $u = teacher(); $s = own_survey($u, (int)($in['id'] ?? 0)); db()->prepare('DELETE FROM surveys WHERE id = ?')->execute([$s['id']]); out([]); }
/* Teilnehmende (ohne Anmeldung) */
case 'u_info': {
    $s = survey_by_code((string)($in['code'] ?? '')); $o = user((int)$s['owner_id']);
    $doc = $s['open'] && $s['pub_doc'] ? json_decode($s['pub_doc'], true) : null;
    out(['titel' => $s['titel'], 'gruppe' => $s['gruppe'], 'mode' => $s['mode'], 'open' => (bool)$s['open'] && (bool)$s['pub_doc'], 'ended' => (bool)$s['ended'],
        'pub_key' => $o['pub_key'] ?? null, 'lehrkraft' => $o['name'] ?: $o['kuerzel'], 'doc' => $doc]);
}
case 'u_submit': {
    $s = survey_by_code((string)($in['code'] ?? ''));
    if (!$s['open'] || !$s['pub_doc']) fail('Die Umfrage ist geschlossen.', 409);
    $enc = blob($in, 'answers_enc', 400_000); if (!$enc) fail('Antworten fehlen');
    $pdo = db(); $tid = (string)($in['tid'] ?? '');
    if ($s['mode'] !== 'tafel' && (!hexok($tid) || !in_array($tid, json_decode($s['tids'], true) ?: [], true))) fail('Dieser QR-Code gilt nicht (mehr). Sprich mit deiner Lehrkraft.', 403);
    if ($s['mode'] === 'name') {
        $pdo->prepare('INSERT INTO survey_answers (survey_id, k, answers_enc) VALUES (?,?,?) ON CONFLICT(survey_id, k) DO UPDATE SET answers_enc = excluded.answers_enc')
            ->execute([$s['id'], 'p' . $tid, $enc]);
        out([]);
    }
    if ($s['mode'] === 'tafel' && u_count((int)$s['id']) >= 3000) fail('Diese Umfrage nimmt keine Antworten mehr an.', 409);
    $pdo->beginTransaction();
    try {
        if ($s['mode'] === 'einmal') {
            $st = $pdo->prepare('INSERT OR IGNORE INTO survey_used (survey_id, tid) VALUES (?,?)'); $st->execute([$s['id'], $tid]);
            if (!$st->rowCount()) { $pdo->rollBack(); fail('Dieser Code wurde schon benutzt. Jeder Code gilt nur einmal.', 409); }
        }
        $pdo->prepare('INSERT INTO survey_answers (survey_id, k, answers_enc) VALUES (?,?,?)')->execute([$s['id'], bin2hex(random_bytes(16)), $enc]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    out([]);
}
case 'cfg': { // öffentliche Einstellungen für die Oberfläche
    out(['apps' => apps_cfg()]);
}
case 'p_info': {
    $e = exam_by_code(str($in, 'code', 12, true), true);
    out(['exam' => ['status' => $e['status'], 'titel' => $e['status'] === 'entwurf' ? '' : $e['titel'], 'fach' => $e['fach'], 'klasse' => $e['klasse'], 'art' => $e['art'], 'datum' => $e['datum'],
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
    out(['exam' => exam_meta($e), 'key_enc' => $e['key_enc'], 'grading_enc' => $e['grading_enc'], 'notes_enc' => $e['notes_enc'], 'participants' => $p->fetchAll(), 'comments' => $c->fetchAll()]);
}
case 'exam_grading': {
    $u = teacher(); $e = own_exam($u, (int)($in['id'] ?? 0));
    db()->prepare('UPDATE exams SET grading_enc = ?, notes_enc = COALESCE(?, notes_enc), updated = ? WHERE id = ?')->execute([str($in, 'grading_enc', 5_000_000, true), blob($in, 'notes_enc', 400_000), time(), $e['id']]); out([]);
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
