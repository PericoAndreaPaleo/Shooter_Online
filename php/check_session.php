<?php
// ============================================================
// check_session.php — Verifica sessione esistente
//
// Riceve via POST: token
// Controlla che il token esista e non sia scaduto.
// Risponde con JSON: { ok: true, user: { ... } } oppure { error: "..." }
//
// Usa LOCK IN SHARE MODE per lettura condivisa sicura
// delle statistiche giocatore (accesso concorrente protetto).
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

session_start();

// Determina il token da usare (sessione > cookie > body POST)
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
    echo json_encode(['error' => 'No active session.']);
    exit;
}

try {
    $pdo = getDB();

    // Verifica token
    $stmt = $pdo->prepare('
        SELECT s.utente_id, u.username
        FROM sessioni s
        JOIN utenti u ON u.id = s.utente_id
        WHERE s.token = ? AND s.scade_il > NOW()
    ');
    $stmt->execute([$token]);
    $session = $stmt->fetch();

    if (!$session) {
        $_SESSION = [];
        session_destroy();
        setcookie('auth_token',    '', time() - 3600, '/', '', true, true);
        setcookie('auth_username', '', time() - 3600, '/', '', true, true);
        http_response_code(401);
        echo json_encode(['error' => 'Session expired or invalid.']);
        exit;
    }

    // LOCK IN SHARE MODE — lettura condivisa delle statistiche.
    // Permette letture concorrenti ma blocca scritture simultanee,
    // evitando che kills/xp vengano letti mentre vengono aggiornati.
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('
        SELECT livello, xp, kills_totali, morti_totali, partite
        FROM statistiche_giocatore
        WHERE utente_id = ?
        LOCK IN SHARE MODE
    ');
    $stmt->execute([$session['utente_id']]);
    $stats = $stmt->fetch();
    $pdo->commit();

    // Aggiorna sessione PHP
    $_SESSION['logged']   = true;
    $_SESSION['user_id']  = $session['utente_id'];
    $_SESSION['username'] = $session['username'];
    $_SESSION['token']    = $token;

    echo json_encode(['ok' => true, 'user' => array_merge($session, $stats ?: [])]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}