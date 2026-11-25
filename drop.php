<?php
// Probe – Ablage für PlanPad: PlanPad schickt den Stand seiner Noten (mit Notiz, Art, Datum) einer Klasse,
// verschlüsselt mit dem öffentlichen Schlüssel der Lehrkraft. Nur schreiben, nie lesen; der Token aus dem
// Verbindungscode berechtigt genau für diese eine Klasse. Der Server sieht nur Größe und Zeitpunkt.
declare(strict_types=1);
require __DIR__ . '/intern/db.php';

header('Access-Control-Allow-Origin: *');            // PlanPad liegt auf einer anderen Adresse; ohne Cookies, Berechtigung nur über den Token
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function reply(array $d, int $code = 200): never { http_response_code($code); echo json_encode(['ok' => $code < 400] + $d, JSON_UNESCAPED_UNICODE); exit; }

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') reply([]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(['error' => 'Nur POST'], 405);
$raw = (string)file_get_contents('php://input', false, null, 0, 2_100_000);
if (strlen($raw) > 2_000_000) reply(['error' => 'Daten zu groß'], 413);
$in = json_decode($raw, true); if (!is_array($in)) reply(['error' => 'Ungültige Anfrage'], 400);
$t = (string)($in['t'] ?? ''); $data = $in['data_enc'] ?? null;
if (!preg_match('~^[A-Za-z0-9_-]{20,64}$~', $t)) reply(['error' => 'Verbindung ungültig'], 403);
if (!is_string($data) || $data === '' || ($j = json_decode($data, true)) === null || ($j['v'] ?? 0) !== 1 || !isset($j['e'], $j['d'])) reply(['error' => 'Inhalt muss verschlüsselt sein'], 400);
$pdo = db();
$st = $pdo->prepare('SELECT id, updated FROM drops WHERE token_hash = ?'); $st->execute([hash('sha256', $t)]); $d = $st->fetch();
if (!$d) { usleep(300000); reply(['error' => 'Diese Verbindung gibt es nicht mehr – in Probe einen neuen Code erzeugen.'], 403); }
$now = time(); if ($d['updated'] && $now - (int)$d['updated'] < 2) reply(['error' => 'Bitte kurz warten'], 429);
$pdo->prepare('UPDATE drops SET data_enc = ?, n = ?, updated = ? WHERE id = ?')->execute([$data, max(0, min(100000, (int)($in['n'] ?? 0))), $now, $d['id']]);
reply(['updated' => $now]);
