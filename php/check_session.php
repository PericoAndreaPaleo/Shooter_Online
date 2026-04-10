<?php
// ============================================================
// check_session.php — Verifica sessione esistente
//
// Riceve via POST: token
// Controlla che il token esista e non sia scaduto.
// Risponde con JSON: { ok: true, user: { ... } } oppure { error: "..." }
// ============================================================

require_once 'db.php';

header('Content-Type: application/json');

$data  = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? '');

if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'Token mancante.']);
    exit;
}

try {
    $pdo = getDB();

    // JOIN tra sessioni, utenti e statistiche in una sola query
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
        http_response_code(401);
        echo json_encode(['error' => 'Sessione scaduta o non valida.']);
        exit;
    }

    echo json_encode(['ok' => true, 'user' => $result]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}