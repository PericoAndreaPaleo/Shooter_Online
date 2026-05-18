<?php
// ============================================================
// login.php — Login utente
//
// Riceve via POST JSON: username, password
// Risponde con JSON: { ok: true, token, username, livello, xp }
//
// Usa:
//   • session_start() / $_SESSION per mantenimento stato
//   • setcookie() per cookie persistente
//   • prepared statement contro SQL injection
//   • password_verify() per verifica sicura password
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

// Avvia sessione PHP nativa
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

    // Prepared statement — cerca utente
    $stmt = $pdo->prepare('SELECT id, password_hash FROM utenti WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials.']);
        exit;
    }

    // Genera token sicuro (64 char hex)
    $token   = bin2hex(random_bytes(32));
    $scadeIl = date('Y-m-d H:i:s', strtotime('+7 days'));

    // Salva token nel DB
    $stmt = $pdo->prepare('INSERT INTO sessioni (token, utente_id, scade_il) VALUES (?, ?, ?)');
    $stmt->execute([$token, $user['id'], $scadeIl]);

    // Aggiorna ultimo accesso
    $stmt = $pdo->prepare('UPDATE utenti SET ultimo_accesso = NOW() WHERE id = ?');
    $stmt->execute([$user['id']]);

    // Carica statistiche
    $stmt = $pdo->prepare('SELECT livello, xp, kills_totali, morti_totali FROM statistiche_giocatore WHERE utente_id = ?');
    $stmt->execute([$user['id']]);
    $stats = $stmt->fetch();

    // ── Sessione PHP nativa ───────────────────────────────────
    $_SESSION['logged']   = true;
    $_SESSION['user_id']  = $user['id'];
    $_SESSION['username'] = $username;
    $_SESSION['token']    = $token;

    // ── Cookie persistente (7 giorni) ─────────────────────────
    // HttpOnly e Secure per sicurezza
    setcookie('auth_token',    $token,    time() + (7 * 24 * 3600), '/', '', true, true);
    setcookie('auth_username', $username, time() + (7 * 24 * 3600), '/', '', true, true);

    echo json_encode([
        'ok'           => true,
        'token'        => $token,
        'userId'       => $user['id'],
        'username'     => $username,
        'livello'      => $stats['livello']      ?? 1,
        'xp'           => $stats['xp']           ?? 0,
        'kills_totali' => $stats['kills_totali'] ?? 0,
        'morti_totali' => $stats['morti_totali'] ?? 0,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}