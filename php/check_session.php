<?php
// ============================================================
// check_session.php — Verifica sessione esistente
//
// Controlla in ordine:
//   1. $_SESSION['logged'] — sessione PHP attiva
//   2. $_COOKIE['auth_token'] — cookie persistente
//   3. token inviato via POST JSON (dal gioco via fetch)
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

// Avvia sessione PHP nativa
session_start();

// Determina il token da usare (sessione > cookie > body POST)
$token = null;

if (!empty($_SESSION['token'])) {
    $token = $_SESSION['token'];
} elseif (!empty($_COOKIE['auth_token'])) {
    $token = $_COOKIE['auth_token'];
} else {
    $data  = json_decode(file_get_contents('php://input'), true);
    $token = trim($data['token'] ?? '');
}

if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'Nessuna sessione attiva.']);
    exit;
}

try {
    $pdo = getDB();

    // Verifica token nel DB con JOIN
    $stmt = $pdo->prepare('
        SELECT s.utente_id, u.username, g.livello, g.xp, g.kills_totali, g.morti_totali, g.partite
        FROM sessioni s
        JOIN utenti u ON u.id = s.utente_id
        JOIN statistiche_giocatore g ON g.utente_id = s.utente_id
        WHERE s.token = ? AND s.scade_il > NOW()
    ');
    $stmt->execute([$token]);
    $result = $stmt->fetch();

    if (!$result) {
        // Token scaduto — pulisci sessione e cookie
        $_SESSION = [];
        session_destroy();
        setcookie('auth_token',    '', time() - 3600, '/', '', true, true);
        setcookie('auth_username', '', time() - 3600, '/', '', true, true);

        http_response_code(401);
        echo json_encode(['error' => 'Sessione scaduta o non valida.']);
        exit;
    }

    // Aggiorna $_SESSION con i dati freschi
    $_SESSION['logged']   = true;
    $_SESSION['user_id']  = $result['utente_id'];
    $_SESSION['username'] = $result['username'];
    $_SESSION['token']    = $token;

    echo json_encode(['ok' => true, 'user' => $result]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}