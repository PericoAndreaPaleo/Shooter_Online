<?php
// ============================================================
// login.php — Login utente
//
// Riceve via POST JSON: username, password
// Risponde con JSON: { ok: true, token, username, livello,
//                      xp, kills_totali, morti_totali,
//                      player_color_id, weapon_color_id }
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

session_start();

$data     = json_decode(file_get_contents('php://input'), true);
$username = trim($data['username'] ?? '');
$password = $data['password']      ?? '';

if (!$username || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing fields.']);
    exit;
}

try {
    $pdo = getDB();

    $stmt = $pdo->prepare('SELECT id, password_hash FROM utenti WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials.']);
        exit;
    }

    // Genera token (64 char hex = 32 bytes)
    $token   = bin2hex(random_bytes(32));
    $scadeIl = date('Y-m-d H:i:s', strtotime('+30 days'));

    $stmt = $pdo->prepare('INSERT INTO sessioni (token, utente_id, scade_il) VALUES (?, ?, ?)');
    $stmt->execute([$token, $user['id'], $scadeIl]);

    $stmt = $pdo->prepare('UPDATE utenti SET ultimo_accesso = NOW() WHERE id = ?');
    $stmt->execute([$user['id']]);

    // Statistiche
    $stmt = $pdo->prepare('SELECT livello, xp, kills_totali, morti_totali FROM statistiche_giocatore WHERE utente_id = ?');
    $stmt->execute([$user['id']]);
    $stats = $stmt->fetch();

    // Cosmetics — assicura che la riga esista
    $pdo->prepare('INSERT IGNORE INTO cosmetics_giocatore (utente_id) VALUES (?)')->execute([$user['id']]);
    $stmt = $pdo->prepare('SELECT player_color_id, weapon_color_id FROM cosmetics_giocatore WHERE utente_id = ?');
    $stmt->execute([$user['id']]);
    $cosmetics = $stmt->fetch();

    // Sessione PHP
    $_SESSION['logged']   = true;
    $_SESSION['user_id']  = $user['id'];
    $_SESSION['username'] = $username;
    $_SESSION['token']    = $token;

    // Cookie 30 giorni
    setcookie('auth_token',    $token,    time() + (30 * 24 * 3600), '/', '', true, true);
    setcookie('auth_username', $username, time() + (30 * 24 * 3600), '/', '', true, true);

    echo json_encode([
        'ok'             => true,
        'token'          => $token,
        'userId'         => $user['id'],
        'username'       => $username,
        'livello'        => $stats['livello']      ?? 1,
        'xp'             => $stats['xp']           ?? 0,
        'kills_totali'   => $stats['kills_totali'] ?? 0,
        'morti_totali'   => $stats['morti_totali'] ?? 0,
        'player_color_id'=> $cosmetics['player_color_id'] ?? null,
        'weapon_color_id'=> $cosmetics['weapon_color_id'] ?? null,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}