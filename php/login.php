<?php
// ============================================================
// login.php — Login utente
//
// Riceve via POST: username, password
// Risponde con JSON: { ok: true, token: "...", username: "...",
//                      livello: X, xp: X } oppure { error: "..." }
// ============================================================

require_once 'db.php';

// Permette chiamate cross-origin dal dominio di Render
header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

$data     = json_decode(file_get_contents('php://input'), true);
$username = trim($data['username'] ?? '');
$password = $data['password']      ?? '';

if (!$username || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi mancanti.']);
    exit;
}

try {
    $pdo = getDB();

    // Cerca l'utente per username
    $stmt = $pdo->prepare('SELECT id, password_hash FROM utenti WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    // Verifica password (sicuro contro timing attacks)
    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Credenziali errate.']);
        exit;
    }

    // Genera token di sessione sicuro (64 caratteri hex)
    $token   = bin2hex(random_bytes(32));
    $scadeIl = date('Y-m-d H:i:s', strtotime('+7 days'));

    // Salva il token nella tabella sessioni
    $stmt = $pdo->prepare('INSERT INTO sessioni (token, utente_id, scade_il) VALUES (?, ?, ?)');
    $stmt->execute([$token, $user['id'], $scadeIl]);

    // Aggiorna ultimo accesso
    $stmt = $pdo->prepare('UPDATE utenti SET ultimo_accesso = NOW() WHERE id = ?');
    $stmt->execute([$user['id']]);

    // Carica statistiche
    $stmt = $pdo->prepare('SELECT * FROM statistiche_giocatore WHERE utente_id = ?');
    $stmt->execute([$user['id']]);
    $stats = $stmt->fetch();

    echo json_encode([
        'ok'       => true,
        'token'    => $token,
        'userId'   => $user['id'],
        'username' => $username,
        'livello'  => $stats['livello'] ?? 1,
        'xp'       => $stats['xp']      ?? 0,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}