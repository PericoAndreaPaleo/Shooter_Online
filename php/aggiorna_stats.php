<?php
// ============================================================
// aggiorna_stats.php  —  Aggiornamento DELTA kills/morti in tempo reale
//
// Chiamato dal server Node.js:
//   • a ogni kill  → { token, kills: 1, morti: 0 }
//   • a ogni morte → { token, kills: 0, morti: 1 }
//
// Usa un singolo UPDATE atomico — nessuna transazione necessaria,
// nessuna race condition possibile anche con chiamate simultanee.
// Il livello viene ricalcolato inline con la formula:
//   livello = GREATEST(1, FLOOR((xp + delta_xp) / 100) + 1)
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

$data  = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? '');
$kills = intval($data['kills'] ?? 0);
$morti = intval($data['morti'] ?? 0);

// Validazione token
if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing token.']);
    exit;
}

// Ogni chiamata deve essere esattamente +1 kills OPPURE +1 morti, mai entrambi
// e mai 0+0 (operazione vuota).
if (!( ($kills === 1 && $morti === 0) || ($kills === 0 && $morti === 1) )) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid delta: must be exactly {kills:1,morti:0} or {kills:0,morti:1}.']);
    exit;
}

$deltaXp = $kills * 10; // +10 XP per kill, +0 XP per morte

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

    // Un singolo UPDATE atomico — nessuna SELECT necessaria.
    // In MySQL, nelle espressioni dentro SET, i nomi di colonna si riferiscono
    // al valore PRIMA dell'aggiornamento della riga stessa, quindi è corretto
    // usare (xp + ?) sia per aggiornare xp sia per calcolare il livello.
    $stmt = $pdo->prepare('
        UPDATE statistiche_giocatore
        SET kills_totali = kills_totali + ?,
            morti_totali = morti_totali + ?,
            xp           = xp + ?,
            livello      = GREATEST(1, FLOOR((xp + ?) / 100) + 1)
        WHERE utente_id = ?
    ');
    $stmt->execute([$kills, $morti, $deltaXp, $deltaXp, $utenteId]);

    echo json_encode(['ok' => true]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}