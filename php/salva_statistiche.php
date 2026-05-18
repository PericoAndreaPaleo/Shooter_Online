<?php
// ============================================================
// salva_statistiche.php  —  +1 partita al primo spawn della sessione
//
// Chiamato dal server Node.js una sola volta per sessione,
// quando il giocatore fa il primo spawn (flag socket.partitaContata).
// Riceve via POST JSON: { token }
//
// Kills, morti e XP da kills vengono aggiornati in tempo reale
// da aggiorna_stats.php — qui si gestisce SOLO partite + 2 XP
// per la partecipazione.
//
// Usa un singolo UPDATE atomico — nessuna transazione necessaria.
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

$data  = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? '');

if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing token.']);
    exit;
}

try {
    $pdo = getDB();

    // Trova utente dal token
    $stmt = $pdo->prepare('
        SELECT utente_id FROM sessioni
        WHERE token = ? AND scade_il > NOW()
        LIMIT 1
    ');
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row) {
        http_response_code(401);
        echo json_encode(['error' => 'Token non valido o scaduto.']);
        exit;
    }

    $utenteId = $row['utente_id'];

    // Singolo UPDATE atomico: +1 partita, +2 XP, ricalcola livello inline.
    $stmt = $pdo->prepare('
        UPDATE statistiche_giocatore
        SET partite = partite + 1,
            xp      = xp + 2,
            livello = GREATEST(1, FLOOR((xp + 2) / 100) + 1)
        WHERE utente_id = ?
    ');
    $stmt->execute([$utenteId]);

    echo json_encode(['ok' => true]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}